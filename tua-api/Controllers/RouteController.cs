using Microsoft.AspNetCore.Mvc;
using TuaApi.Algorithms;
using TuaApi.Models.Request;
using TuaApi.Models.Response;
using System.Diagnostics;

namespace TuaApi.Controllers;

[ApiController]
[Route("api/route")]
public class RouteController : ControllerBase
{
    private readonly ILogger<RouteController> _logger;
    public RouteController(ILogger<RouteController> logger) => _logger = logger;

    /// <summary>POST /api/route/calculate  Runs A* and returns optimized path.</summary>
    [HttpPost("calculate")]
    [ProducesResponseType(typeof(RouteResponse), 200)]
    [ProducesResponseType(typeof(RouteResponse), 400)]
    public ActionResult<RouteResponse> Calculate([FromBody] RouteRequest request)
    {
        if (request.HeightMap.Length != request.GridSize * request.GridSize)
            return BadRequest(new RouteResponse { Success = false, Error = "HeightMap boyutu gridSize^2 olmalı." });

        _logger.LogInformation("Route calculation: ({sx},{sz}) -> ({ex},{ez}), grid={g}",
            request.StartNode.X, request.StartNode.Z,
            request.EndNode.X,   request.EndNode.Z,
            request.GridSize);

        var sw = Stopwatch.StartNew();
        try
        {
            var (path, totalCost) = AStarAlgorithm.FindPath(request);
            sw.Stop();

            return Ok(new RouteResponse
            {
                Success   = true,
                Path      = path.ToArray(),
                TotalCost = totalCost,
                StepCount = path.Count,
                ElapsedMs = sw.ElapsedMilliseconds,
            });
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "Route calculation failed");
            return StatusCode(500, new RouteResponse { Success = false, Error = ex.Message });
        }
    }
}
