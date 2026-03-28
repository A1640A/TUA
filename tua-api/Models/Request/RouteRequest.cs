namespace TuaApi.Models.Request;
public class RouteRequest
{
    public GridNode    StartNode   { get; set; } = new();
    public GridNode    EndNode     { get; set; } = new();
    public int         GridSize    { get; set; } = 128;
    public float[]     HeightMap   { get; set; } = [];
    public float[]     CraterMap   { get; set; } = [];
    public CostWeights CostWeights { get; set; } = new();
}

public class GridNode { public int X { get; set; } public int Z { get; set; } }
