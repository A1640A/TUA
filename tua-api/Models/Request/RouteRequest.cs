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
    /// Each obstacle completely blocks its grid cell (treated as impassable).
    /// Supports mid-drive rerouting without modifying the original HeightMap.
    /// </summary>
    public List<GridNode> AddedObstacles { get; set; } = [];

    /// <summary>
    /// When true, the response will include the <c>VisitedNodes</c> array
    /// containing every grid cell the A* algorithm expanded, in order.
    /// Use for real-time scan animation on the frontend.
    /// </summary>
    public bool ReturnVisited { get; set; } = false;

    /// <summary>
    /// Rover half-width in grid cells used for the footprint clearance check.
    /// A value of 1 checks a 3×3 kernel (default); 2 checks a 5×5 kernel.
    /// The rover will never be routed through a corridor narrower than its footprint.
    /// </summary>
    [Range(0, 4)]
    public int RoverFootprint { get; set; } = 1;

    /// <summary>
    /// Maximum slope angle the rover chassis can traverse, in degrees [0–90].
    /// Any grid cell whose steepest cross-footprint height gradient exceeds this
    /// angle is treated as permanently impassable (like a wall).
    /// Default: 30° — consistent with typical lunar-rover design specs.
    /// </summary>
    [Range(0f, 90f)]
    public float MaxInclineDeg { get; set; } = 30f;
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
