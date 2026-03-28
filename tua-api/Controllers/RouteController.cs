using Microsoft.AspNetCore.Mvc;
using TuaApi.Algorithms;
using TuaApi.Models.Request;
using TuaApi.Models.Response;
using System.Diagnostics;

namespace TuaApi.Controllers;

/// <summary>
/// Handles all route-planning requests for the TUA lunar rover simulation.
/// Exposes a single POST endpoint that runs the optimised A* pathfinder and
/// optionally streams visited-node data for real-time frontend scan animation.
/// </summary>
[ApiController]
[Route("api/route")]
public class RouteController : ControllerBase
{
    private readonly ILogger<RouteController> _logger;

    /// <inheritdoc cref="RouteController"/>
    public RouteController(ILogger<RouteController> logger) => _logger = logger;

    /// <summary>
    /// POST /api/route/calculate
    /// <para>
    /// Runs the A* pathfinder for the given terrain and returns the optimised path.
    /// If <c>ReturnVisited</c> is true in the request body, the response will also
    /// include a <c>VisitedNodes</c> array for the frontend scan-animation overlay.
    /// </para>
    /// <para>
    /// Dynamic obstacles supplied in <c>AddedObstacles</c> are merged into the search
    /// without mutating the caller's HeightMap or CraterMap — enabling low-latency
    /// mid-drive reroutes (typical recalc &lt; 5 ms on a 128×128 grid).
    /// </para>
    /// </summary>
    /// <param name="request">Fully populated route request.</param>
    /// <returns>
    /// <list type="bullet">
    ///   <item><description>200 OK — valid path found.</description></item>
    ///   <item><description>400 Bad Request — HeightMap size mismatch.</description></item>
    ///   <item><description>422 Unprocessable Content — end node is unreachable (completely blocked).</description></item>
    ///   <item><description>500 Internal Server Error — unexpected algorithm failure.</description></item>
    /// </list>
    /// </returns>
    [HttpPost("calculate")]
    [ProducesResponseType(typeof(RouteResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RouteResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(RouteResponse), StatusCodes.Status422UnprocessableEntity)]
    [ProducesResponseType(typeof(RouteResponse), StatusCodes.Status500InternalServerError)]
    public ActionResult<RouteResponse> Calculate([FromBody] RouteRequest request)
    {
        // Validate HeightMap dimensions.
        int expectedSize = request.GridSize * request.GridSize;
        if (request.HeightMap.Length != expectedSize)
        {
            return BadRequest(new RouteResponse
            {
                Success = false,
                Error   = $"HeightMap boyutu {expectedSize} olmalı ({request.GridSize}²), ancak {request.HeightMap.Length} alındı."
            });
        }

        _logger.LogInformation(
            "Rota hesaplama: ({sx},{sz}) → ({ex},{ez}), grid={g}, engel={obs}, ziyaret={vis}",
            request.StartNode.X, request.StartNode.Z,
            request.EndNode.X,   request.EndNode.Z,
            request.GridSize,
            request.AddedObstacles.Count,
            request.ReturnVisited);

        var sw = Stopwatch.StartNew();
        try
        {
            var result = AStarAlgorithm.FindPath(request);
            sw.Stop();

            // The end node was completely blocked — return a dedicated status code.
            if (result.IsUnreachable)
            {
                return UnprocessableEntity(new RouteResponse
                {
                    Success      = false,
                    IsUnreachable= true,
                    VisitedNodes = result.VisitedNodes,
                    ElapsedMs    = sw.ElapsedMilliseconds,
                    Error        = "Hedef noktasına ulaşılamıyor: tüm geçiş yolları engellendi."
                });
            }

            return Ok(new RouteResponse
            {
                Success      = true,
                Path         = result.Path.ToArray(),
                TotalCost    = result.TotalCost,
                StepCount    = result.Path.Count,
                ElapsedMs    = sw.ElapsedMilliseconds,
                VisitedNodes = result.VisitedNodes,
                IsUnreachable= false,
            });
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "Rota hesaplama beklenmedik hatayla sonuçlandı");
            return StatusCode(StatusCodes.Status500InternalServerError, new RouteResponse
            {
                Success   = false,
                ElapsedMs = sw.ElapsedMilliseconds,
                Error     = ex.Message
            });
        }
    }
}
