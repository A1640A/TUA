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
/// <b>Dynamic obstacles (type-aware two-tier clearance):</b>
/// <list type="bullet">
///   <item><b>Hard-block set</b> — permanently impassable cells derived from the obstacle's rigid
///   square kernel (size depends on ObstacleType). Rover cannot enter under any condition.</item>
///   <item><b>Soft-block set</b> — slope-gated rim cells for craters and dust-mounds. A cell in
///   this set is only impassable when it is ALSO in the pre-computed slope-impassable set
///   (i.e. the local terrain gradient there exceeds MaxInclineDeg). Gentle rim edges remain
///   traversable; cliff-like walls are blocked — letting the algorithm find paths between
///   the crater rim and the hard inner block.</item>
/// </list>
/// <b>Volumetric clearance:</b> Every candidate cell is tested against the rover's
/// physical footprint (a (2·RoverFootprint+1)² kernel) against the hard-block set,
/// preventing the rover from clipping through narrow gaps between boulders.
/// <br/>
/// <b>Max-incline filter:</b> Cells where the steepest height gradient across the full
/// rover footprint perimeter exceeds MaxInclineDeg are pre-marked impassable.
/// The perimeter scan samples ALL (2r+1)² - 1 kernel cells to catch narrow ridges.
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

    // ── Per-type clearance configuration ─────────────────────────────────────────
    //
    // HardRadius: half-side of the rigid square block drawn around the obstacle centre.
    //   HardRadius 0 → 1×1 (centre only)
    //   HardRadius 1 → 3×3
    //   HardRadius 2 → 5×5
    //   HardRadius 3 → 7×7
    //
    // SoftRingWidth: extra ring beyond the hard block that is slope-gated (only blocked
    //   when the terrain gradient also exceeds MaxInclineDeg at that cell).
    //   0 → no soft ring (purely hard).
    //
    private static (int HardRadius, int SoftRingWidth) GetClearanceConfig(string obstacleType) =>
        obstacleType switch
        {
            "boulder-sm"  => (0, 0),   // 1×1 hard, no soft ring
            "boulder-md"  => (1, 0),   // 3×3 hard
            "boulder-lg"  => (3, 0),   // 7×7 hard — massive formation blocks wide area
            "crater"      => (2, 2),   // 5×5 hard inner + 2-cell slope-gated rim ring
            "dust-mound"  => (1, 2),   // 3×3 hard centre + 2-cell slope-gated rim ring
            "antenna"     => (2, 0),   // 5×5 hard — debris field
            _             => (1, 0),   // default: 3×3 hard
        };

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
        int fp = Math.Clamp(req.RoverFootprint, 0, 4);

        // ── Build two-tier obstacle sets ─────────────────────────────────────────
        HashSet<int>? hardBlockSet = null;
        HashSet<int>? softBlockSet = null;

        if (req.AddedObstacles.Count > 0)
        {
            hardBlockSet = new HashSet<int>(capacity: req.AddedObstacles.Count * 16);
            softBlockSet = new HashSet<int>(capacity: req.AddedObstacles.Count * 8);

            foreach (var obs in req.AddedObstacles)
            {
                var (hardR, softW) = GetClearanceConfig(obs.ObstacleType);

                // Fill hard block — full square kernel of side (2·hardR+1)
                for (int kdz = -hardR; kdz <= hardR; kdz++)
                {
                    int kz = obs.Z + kdz;
                    if ((uint)kz >= (uint)gs) continue;
                    for (int kdx = -hardR; kdx <= hardR; kdx++)
                    {
                        int kx = obs.X + kdx;
                        if ((uint)kx >= (uint)gs) continue;
                        hardBlockSet.Add(kz * gs + kx);
                    }
                }

                // Fill soft ring — annular zone just outside the hard block
                if (softW > 0)
                {
                    int outerR = hardR + softW;
                    for (int kdz = -outerR; kdz <= outerR; kdz++)
                    {
                        int kz = obs.Z + kdz;
                        if ((uint)kz >= (uint)gs) continue;
                        for (int kdx = -outerR; kdx <= outerR; kdx++)
                        {
                            // Only the ring beyond the hard block
                            if (Math.Abs(kdx) <= hardR && Math.Abs(kdz) <= hardR) continue;
                            int kx = obs.X + kdx;
                            if ((uint)kx >= (uint)gs) continue;
                            int kid = kz * gs + kx;
                            if (!hardBlockSet.Contains(kid))
                                softBlockSet.Add(kid);
                        }
                    }
                }
            }
        }

        // ── Pre-compute slope-impassable set ─────────────────────────────────────
        var slopeImpassable = BuildSlopeImpassableSet(req.HeightMap, gs, fp, req.MaxInclineDeg);

        // ── Pre-compute crater-saturation impassable set ─────────────────────────
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

                // ── Gate 3a: Hard obstacle block (rigid per-type square kernel) ──
                if (hardBlockSet is not null && hardBlockSet.Contains(nId)) continue;

                // ── Gate 3b: Hard obstacle volumetric clearance (rover footprint)  ─
                // Rover footprint must not overlap ANY hard-block cell, preventing
                // narrow-gap clipping even when the centre cell is technically clear.
                if (hardBlockSet is not null && fp > 0 && FootprintHitsObstacle(nx, nz, fp, gs, hardBlockSet))
                    continue;

                // ── Gate 3c: Soft (slope-gated) rim zone ────────────────────────
                // A soft-block cell is only impassable when it is ALSO slope-impassable
                // at this grid position. Gentle rim edges remain traversable.
                if (softBlockSet is not null && softBlockSet.Contains(nId) && slopeImpassable.Contains(nId))
                    continue;

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

        // Check reachability.
        if (!parent.ContainsKey(endId))
        {
            return new AStarResult([], 0f, visited?.ToArray() ?? [], IsUnreachable: true);
        }

        return ReconstructPath(parent, endId, gs, req.HeightMap, gScore, visited?.ToArray() ?? []);
    }

    // ── Footprint clearance helper ────────────────────────────────────────────────

    /// <summary>
    /// Returns true if any cell within the (2·fp+1)² kernel centred on (cx, cz)
    /// is in the provided obstacle set. Cells outside the grid are ignored.
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

        int   scanRadius = fp > 0 ? fp : 1;

        var result = new HashSet<int>(capacity: gs * gs / 8);

        for (int z = 0; z < gs; z++)
        {
            for (int x = 0; x < gs; x++)
            {
                int   id      = z * gs + x;
                float hCenter = heightMap.Length > id ? heightMap[id] : 0f;

                float maxSlopeTan = 0f;

                for (int kdz = -scanRadius; kdz <= scanRadius; kdz++)
                {
                    int kz = z + kdz;
                    if ((uint)kz >= (uint)gs) continue;

                    for (int kdx = -scanRadius; kdx <= scanRadius; kdx++)
                    {
                        if (kdx == 0 && kdz == 0) continue;

                        int kx = x + kdx;
                        if ((uint)kx >= (uint)gs) continue;

                        int   kid       = kz * gs + kx;
                        float hCorner   = heightMap.Length > kid ? heightMap[kid] : 0f;
                        float dh        = MathF.Abs(hCorner - hCenter);
                        float horizDist = MathF.Sqrt(kdx * kdx + kdz * kdz);
                        float slopeHere = dh / horizDist;

                        if (slopeHere > maxSlopeTan) maxSlopeTan = slopeHere;
                    }
                }

                if (maxSlopeTan > maxTan)
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
