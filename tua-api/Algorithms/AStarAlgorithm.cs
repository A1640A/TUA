using TuaApi.Models.Request;
using TuaApi.Models.Response;

namespace TuaApi.Algorithms;

/// <summary>
/// Multi-parameter A* pathfinder for lunar surface navigation.
/// Cost function: distance + elevation_penalty + slope^2_penalty + crater_risk_penalty
/// </summary>
public static class AStarAlgorithm
{
    public static (List<RoutePoint> Path, float TotalCost) FindPath(RouteRequest req)
    {
        var gs = req.GridSize;
        var w  = req.CostWeights;

        var open   = new PriorityQueue<Node, float>();
        var closed = new HashSet<int>();
        var gScore = new Dictionary<int, float>();
        var parent = new Dictionary<int, int>();

        int startId = req.StartNode.Z * gs + req.StartNode.X;
        int endId   = req.EndNode.Z   * gs + req.EndNode.X;

        gScore[startId] = 0f;
        open.Enqueue(new Node(req.StartNode.X, req.StartNode.Z, startId), 0f);

        int[] dx = { 1, -1, 0, 0, 1, 1, -1, -1 };
        int[] dz = { 0,  0, 1,-1, 1,-1,  1, -1 };

        while (open.Count > 0)
        {
            var current = open.Dequeue();
            if (current.Id == endId) break;
            if (!closed.Add(current.Id)) continue;

            for (int d = 0; d < 8; d++)
            {
                int nx = current.X + dx[d];
                int nz = current.Z + dz[d];
                if (nx < 0 || nx >= gs || nz < 0 || nz >= gs) continue;

                int nId = nz * gs + nx;
                if (closed.Contains(nId)) continue;

                float hDist   = dx[d] != 0 && dz[d] != 0 ? 1.414f : 1f;
                float hCurr   = req.HeightMap.Length > current.Id ? req.HeightMap[current.Id] : 0f;
                float hNext   = req.HeightMap.Length > nId ? req.HeightMap[nId] : 0f;
                float elevD   = MathF.Abs(hNext - hCurr);
                float slope   = elevD / hDist;
                float crater  = req.CraterMap.Length > nId ? req.CraterMap[nId] : 0f;

                float moveCost = hDist
                    + w.ElevationWeight  * elevD
                    + w.SlopeWeight      * slope * slope
                    + w.CraterRiskWeight * crater * 10f;

                float tentG = (gScore.TryGetValue(current.Id, out var cg) ? cg : float.MaxValue) + moveCost;
                if (gScore.TryGetValue(nId, out var ng) && tentG >= ng) continue;

                gScore[nId] = tentG;
                parent[nId] = current.Id;

                float h = Heuristic(nx, nz, req.EndNode.X, req.EndNode.Z);
                open.Enqueue(new Node(nx, nz, nId), tentG + h);
            }
        }

        return ReconstructPath(parent, endId, gs, req.HeightMap, gScore);
    }

    private static float Heuristic(int ax, int az, int bx, int bz)
        => MathF.Sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));

    private static (List<RoutePoint> Path, float TotalCost) ReconstructPath(
        Dictionary<int, int> parent, int endId, int gs, float[] heightMap, Dictionary<int, float> gScore)
    {
        var path = new List<int>();
        int cur = endId;
        while (parent.ContainsKey(cur)) { path.Add(cur); cur = parent[cur]; }
        path.Add(cur);
        path.Reverse();

        float total = gScore.TryGetValue(endId, out var tc) ? tc : 0f;
        var points  = path.Select(id =>
        {
            int x = id % gs, z = id / gs;
            float y = heightMap.Length > id ? heightMap[id] : 0f;
            float lc = gScore.TryGetValue(id, out var g) ? g : 0f;
            return new RoutePoint(x, z, y, lc);
        }).ToList();

        return (points, total);
    }

    private record Node(int X, int Z, int Id);
}
