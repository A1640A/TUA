//  Grid & Terrain
export const GRID_SIZE             = 128;
export const TERRAIN_SCALE         = 80;   // World units — expanded terrain for global-view effect
export const TERRAIN_HEIGHT_SCALE  = 4.2;  // Elevation multiplier for visible relief
export const CRATER_COUNT          = 28;   // Realistic lunar mare density (fewer, larger)
export const CRATER_RISK_RADIUS    = 4;    // Grid cells

//  Rover
export const ROVER_SPEED           = 0.032;
export const ROVER_MASS_KG         = 900;
export const ROVER_MAX_SLOPE_DEG   = 25;

//  A* Default Cost Weights
export const DEFAULT_SLOPE_WEIGHT         = 2.5;
export const DEFAULT_CRATER_RISK_WEIGHT   = 5.0;
export const DEFAULT_ELEVATION_WEIGHT     = 1.0;

//  API
export const API_BASE_URL   = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';
export const USE_MOCK_API   = process.env.NEXT_PUBLIC_USE_MOCK_API === 'true';
export const API_TIMEOUT_MS = 10_000;

//  Camera
export const CAMERA_INITIAL_POSITION: [number, number, number] = [0, 48, 64];
export const CAMERA_FOV = 50;

//  Route rendering — keep tube/trail above terrain surface
export const ROUTE_Y_LIFT  = 0.32;
export const TRAIL_Y_LIFT  = 0.24;
