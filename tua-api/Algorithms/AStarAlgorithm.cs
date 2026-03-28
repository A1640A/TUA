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
/// <b>Complexity:</b> O(n log n) average, where n = GridSize².
/// </remarks>
public static class AStarAlgorithm
{
    // Tie-breaking coefficient — just enough to prefer goal-directed nodes without
    // altering the path cost. Value: 1 / (GridSize_max * sqrt(2)) ≈ 1e-4.
    private const float TieBreak = 1.0001f;

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

        // Build a fast O(1) obstacle lookup from the dynamic obstacle list.
        var obstacleSet = req.AddedObstacles.Count > 0
            ? new HashSet<int>(req.AddedObstacles.Select(o => o.Z * gs + o.X))
            : null;

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

                // Skip already-settled cells and dynamic obstacles.
                if (closed.Contains(nId)) continue;
                if (obstacleSet is not null && obstacleSet.Contains(nId)) continue;

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
