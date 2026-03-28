//  Grid & Terrain 
export const GRID_SIZE = 128;
export const TERRAIN_SCALE = 50;          // Three.js units
export const TERRAIN_HEIGHT_SCALE = 6;   // Max elevation in Three.js units
export const CRATER_COUNT = 40;
export const CRATER_RISK_RADIUS = 3;     // Grid cells

//  Rover 
export const ROVER_SPEED = 0.04;         // Grid cells per frame (animation)
export const ROVER_MASS_KG = 900;
export const ROVER_MAX_SLOPE_DEG = 25;   // Hard limit  A* also penalizes

//  A* Default Cost Weights 
export const DEFAULT_SLOPE_WEIGHT = 2.5;
export const DEFAULT_CRATER_RISK_WEIGHT = 5.0;
export const DEFAULT_ELEVATION_WEIGHT = 1.0;

//  API 
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
export const USE_MOCK_API  = process.env.NEXT_PUBLIC_USE_MOCK_API === "true";
export const API_TIMEOUT_MS = 10_000;

//  Camera 
export const CAMERA_INITIAL_POSITION: [number, number, number] = [0, 35, 45];
export const CAMERA_FOV = 55;
