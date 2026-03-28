namespace TuaApi.Models.Response;

/// <summary>
/// The complete response envelope returned by POST /api/route/calculate.
/// Contains the optimised path, performance metrics, and optional visited-node
/// data for real-time scan animation on the frontend.
/// </summary>
public class RouteResponse
{
    /// <summary>True when a valid path was found; false on error or unreachable target.</summary>
    public bool Success { get; set; }

    /// <summary>
    /// Ordered sequence of world-space route points from start to end.
    /// Empty when <see cref="Success"/> is false.
    /// </summary>
    public RoutePoint[] Path { get; set; } = [];

    /// <summary>Accumulated A* g-score of the final path (unitless composite cost).</summary>
    public float TotalCost { get; set; }

    /// <summary>Number of cells in <see cref="Path"/>.</summary>
    public int StepCount { get; set; }

    /// <summary>Wall-clock time the A* search took, in milliseconds.</summary>
    public long ElapsedMs { get; set; }

    /// <summary>
    /// Human-readable error message when <see cref="Success"/> is false.
    /// Null on success.
    /// </summary>
    public string? Error { get; set; }

    /// <summary>
    /// Ordered list of every grid-cell ID (Z * GridSize + X) that A* expanded,
    /// in the exact order they were popped from the open set.
    /// Only populated when the request sets <c>ReturnVisited = true</c>.
    /// Use to drive the real-time scan-overlay animation on the frontend.
    /// </summary>
    public int[] VisitedNodes { get; set; } = [];

    /// <summary>
    /// True when the end node was unreachable (completely surrounded by obstacles).
    /// The caller can use this to notify the user without treating it as a generic error.
    /// </summary>
    public bool IsUnreachable { get; set; }
}
