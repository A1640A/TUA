using TuaApi.Models.Request;
using TuaApi.Models.Response;

namespace TuaApi.Algorithms;

/// <summary>
/// Optimised 8-directional A* pathfinder for lunar surface navigation.
/// </summary>
/// <remarks>
/// <b>Cost function (per edge):</b>
/// <code>
///   moveCost = distance + w.Elevation·|Δheight| + w.Slope·slope² + w.CraterRisk·craterValue·10
/// </code>
/// <b>Heuristic:</b> Euclidean distance with tie-breaking multiplier (1 + ε) to minimise
/// redundant equal-cost node expansion on large open grids.
/// <br/>
/// <b>Dynamic obstacles:</b> Cells listed in <see cref="RouteRequest.AddedObstacles"/>
/// are treated as permanently impassable without mutating the caller's HeightMap.
/// <br/>
/// <b>Volumetric clearance:</b> Every candidate cell is tested against the rover's
/// physical footprint (a (2·RoverFootprint+1)² kernel). Any cell whose footprint
/// overlaps a dynamic obstacle OR whose crater density average exceeds the saturation
/// threshold is rejected, preventing the rover from clipping through narrow gaps
/// between craters or boulders.
/// <br/>
/// <b>Max-incline filter:</b> Cells where the steepest height gradient across the full
/// rover footprint perimeter exceeds MaxInclineDeg are pre-marked impassable (like walls),
/// preventing the rover from attempting lunar cliff traversal.
/// The perimeter scan samples ALL (2r+1)² - 1 kernel cells — not just the 4 diagonal
/// corners — ensuring narrow slope ridges are never missed.
/// <br/>
/// <b>Complexity:</b> O(n log n) average, where n = GridSize².
/// </remarks>
public static class AStarAlgorithm
{
    // Tie-breaking coefficient — just enough to prefer goal-directed nodes without
    // altering the path cost. Value: 1 / (GridSize_max * sqrt(2)) ≈ 1e-4.
    private const float TieBreak = 1.0001f;

    /// <summary>
    /// Average crater-map value across the rover footprint above which a cell is
    /// treated as an impassable obstacle (rover would be driving inside a crater bowl).
    /// </summary>
    private const float CraterSaturationThreshold = 0.65f;

    /// <summary>
    /// Finds the optimal path from <see cref="RouteRequest.StartNode"/> to
    /// <see cref="RouteRequest.EndNode"/> using weighted A*.
    /// </summary>
    /// <param name="req">Fully populated route request including optional obstacles.</param>
    /// <returns>
    /// A tuple of (Path, TotalCost, VisitedNodeIds) where VisitedNodeIds is populated
    /// only when <see cref="RouteRequest.ReturnVisited"/> is true.
    /// </returns>
    public static AStarResult FindPath(RouteRequest req)
    {
        var gs = req.GridSize;
        var w  = req.CostWeights;
        int fp = Math.Clamp(req.RoverFootprint, 0, 4); // footprint half-radius in grid cells

        // ── Build fast O(1) obstacle lookup ──────────────────────────────────────
        var obstacleSet = req.AddedObstacles.Count > 0
            ? new HashSet<int>(req.AddedObstacles.Select(o => o.Z * gs + o.X))
            : null;

        // ── Pre-compute slope-impassable set ─────────────────────────────────────
        // O(n·k²) once — far cheaper than checking inside the hot A* loop.
        var slopeImpassable = BuildSlopeImpassableSet(req.HeightMap, gs, fp, req.MaxInclineDeg);

        // ── Pre-compute crater-saturation impassable set ─────────────────────────
        // Cells where the rover footprint average exceeds the crater threshold.
        var craterImpassable = BuildCraterFootprintImpassableSet(req.CraterMap, gs, fp);

        var open   = new PriorityQueue<Node, float>();
        var closed = new HashSet<int>(capacity: gs * gs / 4);
        var gScore = new Dictionary<int, float>(capacity: gs * gs / 4);
        var parent = new Dictionary<int, int>(capacity: gs * gs / 4);
        var visited = req.ReturnVisited ? new List<int>(capacity: gs * gs / 4) : null;

        int startId = req.StartNode.Z * gs + req.StartNode.X;
        int endId   = req.EndNode.Z   * gs + req.EndNode.X;

        // Guard: start == end
        if (startId == endId)
        {
            var trivialPoint = new RoutePoint(req.StartNode.X, req.StartNode.Z,
                req.HeightMap.Length > startId ? req.HeightMap[startId] : 0f, 0f);
            return new AStarResult([trivialPoint], 0f, [], IsUnreachable: false);
        }

        gScore[startId] = 0f;
        open.Enqueue(new Node(req.StartNode.X, req.StartNode.Z, startId), 0f);

        // 8-directional movement — cardinal (cost 1) and diagonal (cost √2).
        ReadOnlySpan<int> dx = [1, -1, 0, 0, 1,  1, -1, -1];
        ReadOnlySpan<int> dz = [0,  0, 1,-1, 1, -1,  1, -1];

        while (open.Count > 0)
        {
            var current = open.Dequeue();

            // Skip stale entries (lazy deletion instead of costly decrease-key).
            if (!closed.Add(current.Id)) continue;

            // Record for visited-node animation stream.
            visited?.Add(current.Id);

            // Goal reached.
            if (current.Id == endId) break;

            for (int d = 0; d < 8; d++)
            {
                int nx = current.X + dx[d];
                int nz = current.Z + dz[d];

                // Bounds check.
                if ((uint)nx >= (uint)gs || (uint)nz >= (uint)gs) continue;

                int nId = nz * gs + nx;

                // Skip already-settled cells.
                if (closed.Contains(nId)) continue;

                // ── Gate 1: Slope impassable (pre-computed full-perimeter scan) ──
                if (slopeImpassable.Contains(nId)) continue;

                // ── Gate 2: Crater saturation impassable (footprint average) ─────
                if (craterImpassable.Contains(nId)) continue;

                // ── Gate 3: Volumetric footprint clearance (dynamic obstacles) ───
                // Reject if ANY cell within the rover's physical footprint (fp-cell
                // radius around nx,nz) is a dynamic obstacle.
                if (obstacleSet is not null && FootprintHitsObstacle(nx, nz, fp, gs, obstacleSet))
                    continue;

                // Single-point obstacle check (radius-0 case or no footprint extension).
                if (obstacleSet is not null && fp == 0 && obstacleSet.Contains(nId)) continue;

                // Step distance: 1.0 for cardinal, √2 for diagonal.
                float stepDist = (dx[d] != 0 && dz[d] != 0) ? 1.414f : 1f;

                // Terrain costs (safe array access via conditional).
                float hCurr  = req.HeightMap.Length > current.Id ? req.HeightMap[current.Id] : 0f;
                float hNext  = req.HeightMap.Length > nId        ? req.HeightMap[nId]        : 0f;
                float elevD  = MathF.Abs(hNext - hCurr);
                float slope  = elevD / stepDist;
                float crater = req.CraterMap.Length > nId ? req.CraterMap[nId] : 0f;

                float moveCost = stepDist
                    + w.ElevationWeight  * elevD
                    + w.SlopeWeight      * slope * slope
                    + w.CraterRiskWeight * crater * 10f;

                float tentG = (gScore.TryGetValue(current.Id, out var cg) ? cg : float.MaxValue) + moveCost;

                // Prune if we already know a cheaper g-score for this neighbour.
                if (gScore.TryGetValue(nId, out var ng) && tentG >= ng) continue;

                gScore[nId] = tentG;
                parent[nId] = current.Id;

                // Euclidean heuristic with tie-breaking multiplier.
                int ex = req.EndNode.X, ez = req.EndNode.Z;
                float h = MathF.Sqrt((ex - nx) * (ex - nx) + (ez - nz) * (ez - nz)) * TieBreak;

                open.Enqueue(new Node(nx, nz, nId), tentG + h);
            }
        }

        // Check reachability: end node must appear in the parent map (or equal start).
        if (!parent.ContainsKey(endId))
        {
            return new AStarResult([], 0f, visited?.ToArray() ?? [], IsUnreachable: true);
        }

        return ReconstructPath(parent, endId, gs, req.HeightMap, gScore, visited?.ToArray() ?? []);
    }

    // ── Footprint clearance helper ────────────────────────────────────────────────

    /// <summary>
    /// Returns true if any cell within the (2·fp+1)² kernel centred on (cx, cz)
    /// is a dynamic obstacle. Cells outside the grid are ignored (safe boundary).
    /// </summary>
    private static bool FootprintHitsObstacle(
        int cx, int cz, int fp, int gs, HashSet<int> obstacleSet)
    {
        for (int kdz = -fp; kdz <= fp; kdz++)
        {
            int kz = cz + kdz;
            if ((uint)kz >= (uint)gs) continue;

            for (int kdx = -fp; kdx <= fp; kdx++)
            {
                int kx = cx + kdx;
                if ((uint)kx >= (uint)gs) continue;

                if (obstacleSet.Contains(kz * gs + kx)) return true;
            }
        }
        return false;
    }

    // ── Slope pre-scan (full-perimeter) ──────────────────────────────────────────

    /// <summary>
    /// Builds a HashSet of cell IDs that are impassable due to terrain slope.
    /// <para>
    /// For every cell (x,z) we scan ALL cells within the footprint kernel
    /// (not just the 4 diagonal corners). This guarantees that narrow slope ridges
    /// — which can be missed with corner-only sampling — are correctly identified.
    /// </para>
    /// <para>
    /// The maximum height delta between the cell centre and any kernel cell is
    /// converted to a slope angle. If that angle exceeds <paramref name="maxInclineDeg"/>
    /// the cell is impassable.
    /// </para>
    /// <para>
    /// When fp == 0, falls back to a 1-step 8-directional scan.
    /// </para>
    /// </summary>
    private static HashSet<int> BuildSlopeImpassableSet(
        float[] heightMap, int gs, int fp, float maxInclineDeg)
    {
        if (maxInclineDeg >= 90f) return []; // disabled

        float maxTan = MathF.Tan(maxInclineDeg * MathF.PI / 180f);

        // Maximum horizontal distance from centre to any kernel corner = fp * √2 grid-units.
        // We normalise Δh against this worst-case horizontal extent.
        int   scanRadius = fp > 0 ? fp : 1;
        float diagDist   = scanRadius * 1.414f;

        var result = new HashSet<int>(capacity: gs * gs / 8);

        for (int z = 0; z < gs; z++)
        {
            for (int x = 0; x < gs; x++)
            {
                int   id      = z * gs + x;
                float hCenter = heightMap.Length > id ? heightMap[id] : 0f;

                float maxDeltaH = 0f;

                // ── Full-perimeter kernel scan ────────────────────────────────
                // Iterate every cell in the (2·r+1)² kernel around (x,z).
                for (int kdz = -scanRadius; kdz <= scanRadius; kdz++)
                {
                    int kz = z + kdz;
                    if ((uint)kz >= (uint)gs) continue;

                    for (int kdx = -scanRadius; kdx <= scanRadius; kdx++)
                    {
                        if (kdx == 0 && kdz == 0) continue; // skip centre

                        int kx = x + kdx;
                        if ((uint)kx >= (uint)gs) continue;

                        int   kid     = kz * gs + kx;
                        float hCorner = heightMap.Length > kid ? heightMap[kid] : 0f;
                        float dh      = MathF.Abs(hCorner - hCenter);

                        // Use the actual Euclidean distance to this kernel cell as the
                        // horizontal reference — more accurate than a fixed maxDiag.
                        float horizDist = MathF.Sqrt(kdx * kdx + kdz * kdz);
                        float slopeHere = dh / horizDist;

                        // Track the maximum slope tangent in the kernel.
                        if (slopeHere > maxDeltaH) maxDeltaH = slopeHere;
                    }
                }

                // slope = Δh / horizontal — impassable if slope > tan(maxIncline).
                if (maxDeltaH > maxTan)
                    result.Add(id);
            }
        }

        return result;
    }

    // ── Crater-density footprint pre-scan ─────────────────────────────────────────

    /// <summary>
    /// Builds a HashSet of cell IDs that are impassable because the rover footprint
    /// overlaps a high-density crater interior.
    /// <para>
    /// For every cell (x,z), the average <c>CraterMap</c> value across the
    /// (2·fp+1)² kernel is computed.  If it exceeds
    /// <see cref="CraterSaturationThreshold"/> the cell is impassable — the rover
    /// would be navigating squarely inside a crater bowl.
    /// </para>
    /// <para>
    /// When fp == 0 a single-cell check is used (average == cell value).
    /// </para>
    /// </summary>
    private static HashSet<int> BuildCraterFootprintImpassableSet(
        float[] craterMap, int gs, int fp)
    {
        if (craterMap.Length == 0) return [];

        int scanRadius = fp > 0 ? fp : 0;
        var result = new HashSet<int>(capacity: gs * gs / 16);

        for (int z = 0; z < gs; z++)
        {
            for (int x = 0; x < gs; x++)
            {
                int   id   = z * gs + x;
                float sum  = 0f;
                int   cnt  = 0;

                for (int kdz = -scanRadius; kdz <= scanRadius; kdz++)
                {
                    int kz = z + kdz;
                    if ((uint)kz >= (uint)gs) continue;

                    for (int kdx = -scanRadius; kdx <= scanRadius; kdx++)
                    {
                        int kx = x + kdx;
                        if ((uint)kx >= (uint)gs) continue;

                        int kid = kz * gs + kx;
                        sum += craterMap.Length > kid ? craterMap[kid] : 0f;
                        cnt++;
                    }
                }

                if (cnt > 0 && (sum / cnt) > CraterSaturationThreshold)
                    result.Add(id);
            }
        }

        return result;
    }

    // ── Path reconstruction ───────────────────────────────────────────────────────

    /// <summary>
    /// Walks <paramref name="parent"/> back-pointers from the end node to rebuild the path,
    /// then reverses it to produce a start→end ordered sequence.
    /// </summary>
    private static AStarResult ReconstructPath(
        Dictionary<int, int> parent,
        int endId,
        int gs,
        float[] heightMap,
        Dictionary<int, float> gScore,
        int[] visitedNodes)
    {
        var pathIds = new List<int>(capacity: 256);
        int cur = endId;

        while (parent.ContainsKey(cur))
        {
            pathIds.Add(cur);
            cur = parent[cur];
        }
        pathIds.Add(cur); // start node
        pathIds.Reverse();

        float totalCost = gScore.TryGetValue(endId, out var tc) ? tc : 0f;
        var points = pathIds.Select(id =>
        {
            int x = id % gs, z = id / gs;
            float y  = heightMap.Length > id ? heightMap[id] : 0f;
            float lc = gScore.TryGetValue(id, out var g) ? g : 0f;
            return new RoutePoint(x, z, y, lc);
        }).ToList();

        return new AStarResult(points, totalCost, visitedNodes, IsUnreachable: false);
    }

    // Internal node for the priority queue — value record for structural equality.
    private readonly record struct Node(int X, int Z, int Id);
}

/// <summary>
/// Strongly-typed result from <see cref="AStarAlgorithm.FindPath"/>.
/// Decouples the algorithm output from the HTTP response contract.
/// </summary>
public sealed record AStarResult(
    List<RoutePoint> Path,
    float TotalCost,
    int[] VisitedNodes,
    bool IsUnreachable);
