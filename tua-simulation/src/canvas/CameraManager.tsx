'use client';
/**
 * CameraManager v3 — Roof-Mounted Follow Camera + Orbit fallback.
 *
 * FPV davranışı:
 *   - Kamera, rover'ın tepesine sabitlenir (ROOF_LOCAL offset).
 *   - Varsayılan yön: rover'ın ilerlediği yön (heading) + sabit aşağı eğim (PITCH_DEFAULT).
 *   - Kullanıcı canvas'ta sol tuşu basılı tutarak sürüklediğinde yatayda (yaw) döndürür.
 *   - Faréyi bırakınca yaw yavaşça sıfırlanır.
 *   - Dikey (pitch) kontrol yok — kamera hep aynı eğimde ileri bakar.
 *
 * Stabilite:
 *   - smoothCamPos / smoothCamQuat: rover micro-jitter'ından bağımsız kamera buffer'ları.
 *   - Her frame yeni nesne tahsisi yok (sıfır GC baskısı).
 */
import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { CAMERA_INITIAL_POSITION, CAMERA_FOV } from '@/lib/constants';

// ── Sabitler ────────────────────────────────────────────────────────────────────

const FPV_FOV = 72;

/**
 * Rover lokal alanında kamera montaj noktası.
 * x=0: tam orta,  y=1.35: rover tepesi üstü,  z=0: ön-arka merkez.
 */
const ROOF_LOCAL = new THREE.Vector3(0, 1.35, 0);

/**
 * Sabit aşağı eğim (pitch).  -0.18 rad ≈ -10°: ilerideki zemini görmek için.
 * Pozitif → yukarı bakar, negatif → aşağı bakar.
 */
const PITCH_DEFAULT = -0.18;

/** Kamera pozisyon LERP (çerçeve başına). Düşük = daha pürüzsüz. */
const CAM_POS_LERP  = 0.09;
/** Kamera rotasyon SLERP. Rover'ın kendi 0.14'ünden biraz yavaş → jitter emilir. */
const CAM_ROT_SLERP = 0.09;

/** Geçiş hızı (FPV ↔ Orbit). */
const TRANSITION_SPD = 0.06;

/** Mouse yatay sürükleme duyarlılığı (radyan/piksel). */
const YAW_SENSITIVITY = 0.006;
/** Yaw offset'in sıfıra dönüş hızı (bırakınca). */
const YAW_RESET       = 0.05;
/** Maksimum yatay bakış açısı (radyan). */
const MAX_YAW         = Math.PI;   // 180° — tam tur serbest

// ── Sıfır GC scratch nesneleri ──────────────────────────────────────────────────
const _roofWorld   = new THREE.Vector3();
const _roofOffset  = new THREE.Vector3();
const _roverEuler  = new THREE.Euler();
const _roverQuat   = new THREE.Quaternion();
const _headingQ    = new THREE.Quaternion();
const _yawQ        = new THREE.Quaternion();
const _pitchQ      = new THREE.Quaternion();
const _targetQuat  = new THREE.Quaternion();
const _worldUp     = new THREE.Vector3(0, 1, 0);
const _localX      = new THREE.Vector3(1, 0, 0);

// ─────────────────────────────────────────────────────────────────────────────────

export default function CameraManager() {
  const { camera, gl } = useThree();
  const cameraMode = useSimulationStore(s => s.cameraMode);
  const roverState = useSimulationStore(s => s.roverState);

  // Geçiş state
  const orbitPosSnap  = useRef(new THREE.Vector3(...CAMERA_INITIAL_POSITION));
  const orbitQuatSnap = useRef(new THREE.Quaternion());
  const transitionT   = useRef(1.0);
  const prevMode      = useRef<'orbit' | 'fpv'>('orbit');

  // Pürüzsüz kamera buffer'ları
  const smoothCamPos  = useRef(new THREE.Vector3(...CAMERA_INITIAL_POSITION));
  const smoothCamQuat = useRef(new THREE.Quaternion());

  // Yatay bakış açısı (kullanıcı kontrolü)
  const yawOffset    = useRef(0);
  const isDragging   = useRef(false);
  const prevMouseX   = useRef(0);

  // ── Mouse sürükleme — canvas üzerinde sol tıklı yatay hareket ─────────────────
  useEffect(() => {
    const canvas = gl.domElement;

    const onMouseDown = (e: MouseEvent) => {
      if (cameraMode !== 'fpv') return;
      if (e.button === 0) {          // sol tuş
        isDragging.current = true;
        prevMouseX.current = e.clientX;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || cameraMode !== 'fpv') return;
      const dx = e.clientX - prevMouseX.current;
      prevMouseX.current = e.clientX;
      yawOffset.current -= dx * YAW_SENSITIVITY;
      yawOffset.current  = THREE.MathUtils.clamp(yawOffset.current, -MAX_YAW, MAX_YAW);
    };

    const onMouseUp = () => { isDragging.current = false; };

    // Touch desteği (tablet)
    const onTouchStart = (e: TouchEvent) => {
      if (cameraMode !== 'fpv' || e.touches.length !== 1) return;
      isDragging.current = true;
      prevMouseX.current = e.touches[0].clientX;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging.current || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - prevMouseX.current;
      prevMouseX.current = e.touches[0].clientX;
      yawOffset.current -= dx * YAW_SENSITIVITY;
      yawOffset.current  = THREE.MathUtils.clamp(yawOffset.current, -MAX_YAW, MAX_YAW);
    };
    const onTouchEnd = () => { isDragging.current = false; };

    canvas.addEventListener('mousedown',  onMouseDown);
    window.addEventListener('mousemove',  onMouseMove);
    window.addEventListener('mouseup',    onMouseUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: true });
    canvas.addEventListener('touchend',   onTouchEnd);

    return () => {
      canvas.removeEventListener('mousedown',  onMouseDown);
      window.removeEventListener('mousemove',  onMouseMove);
      window.removeEventListener('mouseup',    onMouseUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove',  onTouchMove);
      canvas.removeEventListener('touchend',   onTouchEnd);
    };
  }, [cameraMode, gl.domElement]);

  // ── Mod değişimi ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (cameraMode === prevMode.current) return;

    if (cameraMode === 'fpv') {
      orbitPosSnap.current.copy(camera.position);
      orbitQuatSnap.current.copy(camera.quaternion);
      smoothCamPos.current.copy(camera.position);
      smoothCamQuat.current.copy(camera.quaternion);
      transitionT.current = 0;
      yawOffset.current   = 0;     // FPV'ye girerken yaw sıfırla
    } else {
      isDragging.current  = false;
      yawOffset.current   = 0;
      transitionT.current = 0;
    }

    prevMode.current = cameraMode;
  }, [cameraMode, camera]);

  // ── Her frame ────────────────────────────────────────────────────────────────
  useFrame(() => {
    // ── Rover tabanı quaternion'ı (YXZ = araç sırası)
    _roverEuler.set(
      roverState.rotation[0],
      roverState.rotation[1],
      roverState.rotation[2],
      'YXZ',
    );
    _roverQuat.setFromEuler(_roverEuler);

    // ── Rover tepesindeki dünya konumu
    _roofOffset.copy(ROOF_LOCAL).applyQuaternion(_roverQuat);
    _roofWorld.set(
      roverState.position[0],
      roverState.position[1],
      roverState.position[2],
    ).add(_roofOffset);

    if (cameraMode === 'fpv') {
      // ── Geçiş ilerlet
      if (transitionT.current < 1.0) {
        transitionT.current = Math.min(transitionT.current + TRANSITION_SPD, 1.0);
      }

      // ── Yaw sıfırlama (sürükleme bitince)
      if (!isDragging.current && Math.abs(yawOffset.current) > 0.0002) {
        yawOffset.current *= (1 - YAW_RESET);
      } else if (!isDragging.current) {
        yawOffset.current = 0;
      }

      // ── Kamera yönü:
      //    1) Rover heading ekseninde yaw
      //    2) Kullanıcı yaw offset'i (dünya Y etrafında)
      //    3) Sabit pitch aşağı (yerel X etrafında)
      //
      // Adım 1: sadece rover heading yaw (tilt YOK — saf yön)
      _headingQ.setFromAxisAngle(_worldUp, roverState.rotation[1]);

      // Adım 2: kullanıcı yaw (yine dünya Y, heading üstüne biner)
      _yawQ.setFromAxisAngle(_worldUp, yawOffset.current);

      // Adım 3: sabit pitch (rover lokal X ekseninde)
      _localX.set(1, 0, 0).applyQuaternion(_headingQ);   // heading'e göre yerel X
      _pitchQ.setFromAxisAngle(_localX, PITCH_DEFAULT);

      // Bileşim: heading × yaw × pitch
      _targetQuat.copy(_headingQ).multiply(_yawQ).multiply(_pitchQ);

      // ── Kamera buffer'larını güncelle
      smoothCamPos.current.lerp(_roofWorld, CAM_POS_LERP);
      smoothCamQuat.current.slerp(_targetQuat, CAM_ROT_SLERP);

      // ── Kamera'ya uygula
      const alpha = easeInOutCubic(transitionT.current);
      if (transitionT.current >= 1.0) {
        camera.position.copy(smoothCamPos.current);
        camera.quaternion.copy(smoothCamQuat.current);
      } else {
        camera.position.lerpVectors(orbitPosSnap.current, smoothCamPos.current, alpha);
        camera.quaternion.slerpQuaternions(orbitQuatSnap.current, smoothCamQuat.current, alpha);
      }

      // ── FOV geçişi
      const camP = camera as THREE.PerspectiveCamera;
      if (Math.abs(camP.fov - FPV_FOV) > 0.05) {
        camP.fov = THREE.MathUtils.lerp(camP.fov, FPV_FOV, TRANSITION_SPD * 2);
        camP.updateProjectionMatrix();
      }

    } else {
      // ── Orbit'e dönüş
      if (transitionT.current < 1.0) {
        transitionT.current = Math.min(transitionT.current + TRANSITION_SPD * 0.7, 1.0);
        const alpha = easeInOutCubic(transitionT.current);
        camera.position.lerpVectors(smoothCamPos.current, orbitPosSnap.current, alpha);
        camera.quaternion.slerpQuaternions(smoothCamQuat.current, orbitQuatSnap.current, alpha);

        const camP = camera as THREE.PerspectiveCamera;
        if (Math.abs(camP.fov - CAMERA_FOV) > 0.05) {
          camP.fov = THREE.MathUtils.lerp(camP.fov, CAMERA_FOV, TRANSITION_SPD);
          camP.updateProjectionMatrix();
        } else {
          camP.fov = CAMERA_FOV;
          camP.updateProjectionMatrix();
        }
      }
    }

    void gl;
  });

  return null;
}

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
