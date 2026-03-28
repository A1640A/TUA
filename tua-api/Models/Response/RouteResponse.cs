namespace TuaApi.Models.Response;
public class RouteResponse
{
    public bool         Success   { get; set; }
    public RoutePoint[] Path      { get; set; } = [];
    public float        TotalCost { get; set; }
    public int          StepCount { get; set; }
    public long         ElapsedMs { get; set; }
    public string?      Error     { get; set; }
}
