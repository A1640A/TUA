using System.ComponentModel.DataAnnotations;

namespace TuaApi.Models.Request;

/// <summary>
/// The root request body for a single route calculation or dynamic mid-drive recalculation.
/// Supports both initial pathfinding and obstacle-triggered reroutes.
/// </summary>
public class RouteRequest
{
    /// <summary>Starting grid cell (X, Z).</summary>
    [Required]
    public GridNode StartNode { get; set; } = new();

    /// <summary>Target grid cell (X, Z).</summary>
    [Required]
    public GridNode EndNode { get; set; } = new();

    /// <summary>
    /// Square root of the total cell count. HeightMap and CraterMap must have
    /// exactly GridSize × GridSize elements.
    /// </summary>
    [Range(2, 512)]
    public int GridSize { get; set; } = 128;

    /// <summary>
    /// Normalized elevation value per grid cell, row-major order (Z * GridSize + X).
    /// Values should be in [0, 1].
    /// </summary>
    [Required]
    public float[] HeightMap { get; set; } = [];

    /// <summary>
    /// Crater-risk value per grid cell in [0, 1]. 1.0 = crater centre, 0 = safe.
    /// </summary>
    [Required]
    public float[] CraterMap { get; set; } = [];

    /// <summary>A* cost function weighting parameters.</summary>
    [Required]
    public CostWeights CostWeights { get; set; } = new();

    /// <summary>
    /// Dynamic obstacles placed by the user at runtime.
    /// Each entry carries the obstacle type so the A* engine can apply the correct
    /// per-type clearance kernel (rigid square block vs slope-gated rim zone).
    /// </summary>
    public List<ObstacleNode> AddedObstacles { get; set; } = [];

    /// <summary>
    /// When true, the response will include the <c>VisitedNodes</c> array
    /// containing every grid cell the A* algorithm expanded, in order.
    /// Use for real-time scan animation on the frontend.
    /// </summary>
    public bool ReturnVisited { get; set; } = false;

    /// <summary>
    /// Rover half-width in grid cells used for the footprint clearance check.
    /// <list type="bullet">
    ///   <item><term>0</term><description>Single-cell check (no lateral clearance)</description></item>
    ///   <item><term>1</term><description>3×3 kernel — default, ~rover body width</description></item>
    ///   <item><term>2</term><description>5×5 kernel — conservative, avoids narrow gaps</description></item>
    ///   <item><term>3</term><description>7×7 kernel — wide berth around large boulders</description></item>
    /// </list>
    /// At GridSize=128 / TerrainScale=55 each grid cell ≈ 0.43 m real-world.
    /// A footprint of 1 gives ~1.3 m lateral clearance each side — correct for a 1.5 m-wide rover.
    /// </summary>
    [Range(0, 4)]
    public int RoverFootprint { get; set; } = 1;

    /// <summary>
    /// Maximum slope angle the rover chassis can traverse, in degrees [0–90].
    /// Any grid cell whose steepest full-perimeter height gradient across the rover
    /// footprint exceeds this angle is treated as permanently impassable (like a wall).
    /// Default: 25° — consistent with TUA rover design specs and the frontend
    /// ROVER_MAX_SLOPE_DEG constant.
    /// </summary>
    [Range(0f, 90f)]
    public float MaxInclineDeg { get; set; } = 25f;
}

/// <summary>An (X, Z) integer coordinate in the pathfinding grid.</summary>
public class GridNode
{
    /// <summary>Column index in [0, GridSize).</summary>
    [Range(0, 511)]
    public int X { get; set; }

    /// <summary>Row index in [0, GridSize).</summary>
    [Range(0, 511)]
    public int Z { get; set; }
}

/// <summary>
/// An obstacle node sent with a route request, carrying both its grid position
/// and visual/physical type so the A* engine applies the correct clearance kernel.
/// </summary>
/// <remarks>
/// Clearance kernels are calibrated to the physical mesh radii
/// (TERRAIN_SCALE=80 / GRID_SIZE=128 → 1 cell ≈ 0.625 wu). All dynamic
/// obstacles now use fully hard blocks — slope-gating had no effect on flat regolith.
/// <list type="table">
///   <item><term>boulder-sm</term><description>1×1 hard (rx=0.30wu)</description></item>
///   <item><term>boulder-md</term><description>5×5 hard (rx=1.10wu → 3.125wu coverage)</description></item>
///   <item><term>boulder-lg</term><description>9×9 hard (rx=3.20wu → 5.625wu coverage)</description></item>
///   <item><term>crater</term><description>21×21 hard (rx=8.00wu → 13.125wu coverage)</description></item>
///   <item><term>dust-mound</term><description>15×15 hard (rx=5.00wu → 9.375wu coverage)</description></item>
///   <item><term>antenna</term><description>5×5 hard (debris field)</description></item>
/// </list>
/// </remarks>
public class ObstacleNode
{
    /// <summary>Column index in [0, GridSize).</summary>
    [Range(0, 511)]
    public int X { get; set; }

    /// <summary>Row index in [0, GridSize).</summary>
    [Range(0, 511)]
    public int Z { get; set; }

    /// <summary>
    /// Obstacle variant string matching the frontend Obstacle['variant'] union.
    /// Valid values: "boulder-sm", "boulder-md", "boulder-lg", "crater", "dust-mound", "antenna".
    /// Defaults to "boulder-md" for backwards compatibility with old payloads.
    /// </summary>
    public string ObstacleType { get; set; } = "boulder-md";
}
