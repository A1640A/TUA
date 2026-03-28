namespace TuaApi.Models.Request;
public class CostWeights
{
    public float SlopeWeight      { get; set; } = 2.5f;
    public float CraterRiskWeight { get; set; } = 5.0f;
    public float ElevationWeight  { get; set; } = 1.0f;
}
