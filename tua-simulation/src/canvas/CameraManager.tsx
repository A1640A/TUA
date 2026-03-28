'use client';
/**
 * CameraManager v6 — Stabil FPV Kamerası
 *
 * ════════════════════════════════════════════════════════════════════
 *  v5 HATA ANALİZİ
 * ════════════════════════════════════════════════════════════════════
 *
 *  SORUN 1 — Euler sırası uyumsuzluğu (ters/yan dönme):
 *    useRoverAnimation → _euler.setFromQuaternion(smoothQ, 'XYZ')
 *    CameraManager v5  → _roverEuler.set(r[0], r[1], r[2], 'YXZ')   ← YANLIŞ
 *    Aynı sayılar farklı sırayla yorumlanınca tamamen farklı bir
 *    quaternion ortaya çıkıyor → kamera ters/yan dönüyor.
 *
 *  SORUN 2 — rotation[1]'i heading olarak kullanmak:
 *    Terrain eğimi rover'a pitch/roll ekler. XYZ euler decomposition'ında
 *    bu Y bileşenini kirletir → "heading" artık gerçek azimut değildir →
 *    kratere girerken kamera önce sağa sonra sola savrulur.
 *
 *  SORUN 3 — Kamera terrain tilt'ini kalıtıyor:
 *    Rover eğilince kamera da eğiliyordu → ufuk titriyor, mide bulandırıcı.
 *
 * ════════════════════════════════════════════════════════════════════
 *  v6 ÇÖZÜM
 * ════════════════════════════════════════════════════════════════════
 *
 *  1. Tam rover quaternion'ını doğru sırayla ('XYZ') yeniden kur.
 *
 *  2. Gerçek heading: rover'ın local +Z vektörünü world space'e uygula,
 *     XZ'ye flatten, normalize → atan2 → saf azimut açısı.
 *     Bu, terrain tilt'inden bağımsızdır.
 *
 *  3. FPV kamerası yalnızca heading + userYaw + userPitch ile kurulur.
 *     Rover'ın terrain roll/pitch'i kameraya KESINLIKLE geçirilmez.
 *     Sonuç: sakin, mide bulandırmayan, uçuş simülatörü kalitesinde görüş.
 *
 *  4. Sol tık → Pointer Lock. movementX/Y delta ile yaw + pitch.
 *     Escape / mod değişimi → kilit otomatik açılır.
 *
 *  5. FPV'ye girerken smoothCamQuat rover'ın GERÇEK heading'inden başlar
 *     → ilk kare hedefe doğru bakar.
 */

import { useRef, useEffect, type RefObject } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { CAMERA_INITIAL_POSITION, CAMERA_FOV } from '@/lib/constants';

// ── Sabitler ─────────────────────────────────────────────────────────────────

const FPV_FOV = 72;

/** Kamera montaj noktası (rover local space, çatı ortası). */
const ROOF_LOCAL = new THREE.Vector3(0, 1.35, 0);

/** Varsayılan aşağı pitch (radyan). -0.18 ≈ -10°: önü görmek için. */
const PITCH_DEFAULT = -0.18;

/** Konum LERP hızı (kare başına). */
const CAM_POS_LERP  = 0.10;
/** Rotasyon SLERP hızı — heading konusunda hızlı, yumuşak görüntü için. */
const CAM_ROT_SLERP = 0.14;

/** FPV giriş/çıkış geçiş hızı. */
const TRANSITION_SPD = 0.07;

/** Mouse hassasiyeti (radyan / piksel). */
const LOOK_SENSITIVITY = 0.003;

/** Maksimum yatay bakış açısı (radyan). π = ±180°. */
const MAX_YAW = Math.PI;

/** Maksimum dikey bakış açısı (radyan). ~±75°. */
const MAX_PITCH = 1.3;

/** Pointer Lock olmadığında bakış resetleme hızı (kare başına). */
const LOOK_RESET = 0.04;

// ── GC sıfır scratch nesneleri ────────────────────────────────────────────────
const _roofWorld    = new THREE.Vector3();
const _roofOffset   = new THREE.Vector3();
const _roverEuler   = new THREE.Euler(); // 'XYZ' — useRoverAnimation ile eşleşir
const _roverQuat    = new THREE.Quaternion();
const _forward      = new THREE.Vector3(); // rover'ın +Z yönü → world XZ'ye flatten
const _headingQ     = new THREE.Quaternion();
const _yawQ         = new THREE.Quaternion();
const _pitchQ       = new THREE.Quaternion();
const _targetQuat   = new THREE.Quaternion();
const _worldUp      = new THREE.Vector3(0, 1, 0);
const _pitchAxis    = new THREE.Vector3(1, 0, 0); // heading+yaw sonrası local X

// ────────────────────────────────────────────────────────────────────────────

interface CameraManagerProps {
  orbitRef: RefObject<OrbitControlsImpl | null>;
}

export default function CameraManager({ orbitRef }: CameraManagerProps) {
  const { camera, gl } = useThree();
  const cameraMode = useSimulationStore(s => s.cameraMode);
  const roverState = useSimulationStore(s => s.roverState);

  // ── Geçiş durumu ─────────────────────────────────────────────────────────────
  const orbitPosSnap  = useRef(new THREE.Vector3(...CAMERA_INITIAL_POSITION));
  const orbitQuatSnap = useRef(new THREE.Quaternion());
  const transitionT   = useRef(1.0);
  const prevMode      = useRef<'orbit' | 'fpv'>('orbit');

  // ── Kamera buffer'ları ───────────────────────────────────────────────────────
  const smoothCamPos  = useRef(new THREE.Vector3(...CAMERA_INITIAL_POSITION));
  const smoothCamQuat = useRef(new THREE.Quaternion());

  // ── FPV bakış durumu ─────────────────────────────────────────────────────────
  const yawOffset     = useRef(0);
  const pitchOffset   = useRef(PITCH_DEFAULT);
  const pointerLocked = useRef(false);

  // ────────────────────────────────────────────────────────────────────────────
  // Helper: rover'ın gerçek heading radyanını hesapla
  // Sol +X, İleri +Z modelinde rover'ın world-forward XZ projeksiyonundan atan2
  // ────────────────────────────────────────────────────────────────────────────
  const getRoverHeadingRad = (rot: [number, number, number]): number => {
    // ÖNEMLİ: 'XYZ' sırası — useRoverAnimation'ın extraction sırasıyla eşleşmeli
    _roverEuler.set(rot[0], rot[1], rot[2], 'XYZ');
    _roverQuat.setFromEuler(_roverEuler);

    // Rover local forward = +Z → world space
    _forward.set(0, 0, 1).applyQuaternion(_roverQuat);

    // XZ düzlemine flatten (terrain pitch'ini yoksay)
    _forward.y = 0;
    if (_forward.lengthSq() < 0.0001) return 0; // degenerate guard
    _forward.normalize();

    // atan2(x, z) → Y ekseni etrafında açı (Three.js heading convention)
    return Math.atan2(_forward.x, _forward.z);
  };

  // ── Pointer Lock event listener'ları ──────────────────────────────────────────
  useEffect(() => {
    const canvas = gl.domElement;

    const onMouseDown = (e: MouseEvent) => {
      if (cameraMode !== 'fpv') return;
      if (e.button === 0 && !pointerLocked.current) {
        canvas.requestPointerLock();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (cameraMode !== 'fpv' || !pointerLocked.current) return;
      // movementX: sağa pozitif, sola negatif
      // movementY: aşağı pozitif, yukarı negatif
      yawOffset.current   -= e.movementX * LOOK_SENSITIVITY;
      pitchOffset.current -= e.movementY * LOOK_SENSITIVITY;
      yawOffset.current   = THREE.MathUtils.clamp(yawOffset.current,   -MAX_YAW,   MAX_YAW);
      pitchOffset.current = THREE.MathUtils.clamp(pitchOffset.current, -MAX_PITCH, MAX_PITCH);
    };

    const onPointerLockChange = () => {
      pointerLocked.current = document.pointerLockElement === canvas;
    };
    const onPointerLockError = () => {
      pointerLocked.current = false;
    };

    canvas.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', onPointerLockError);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('pointerlockerror', onPointerLockError);
    };
  }, [cameraMode, gl.domElement]);

  // ── Mod değişimi ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (cameraMode === prevMode.current) return;
    const orbit = orbitRef.current;

    if (cameraMode === 'fpv') {
      // Orbit kamera pozisyonu kap
      orbitPosSnap.current.copy(camera.position);
      orbitQuatSnap.current.copy(camera.quaternion);

      // ─ smoothCamQuat'ı rover'ın GERÇEK heading'inden başlat ──────────
      // Bu, FPV'ye geçer geçmez kameranın hedefe bakmasını sağlar.
      // Rover'ın terrain-contaminated rotation yerine, temiz heading kullan.
      const headingRad = getRoverHeadingRad(roverState.rotation as [number, number, number]);
      _headingQ.setFromAxisAngle(_worldUp, headingRad);

      // Varsayılan pitch ekle (aşağı bak)
      _pitchAxis.set(1, 0, 0).applyQuaternion(_headingQ);
      _pitchQ.setFromAxisAngle(_pitchAxis, PITCH_DEFAULT);
      const initialQuat = _headingQ.clone().multiply(_pitchQ);

      // Rover çatı pozisyonunu hesapla
      _roverEuler.set(roverState.rotation[0], roverState.rotation[1], roverState.rotation[2], 'XYZ');
      _roverQuat.setFromEuler(_roverEuler);
      _roofOffset.copy(ROOF_LOCAL).applyQuaternion(_roverQuat);
      const initRoofPos = new THREE.Vector3(
        roverState.position[0],
        roverState.position[1],
        roverState.position[2],
      ).add(_roofOffset);

      smoothCamPos.current.copy(initRoofPos);
      smoothCamQuat.current.copy(initialQuat); // ← DOĞRU hedef yönü

      transitionT.current  = 0;
      yawOffset.current    = 0;
      pitchOffset.current  = PITCH_DEFAULT;

      if (orbit) {
        orbit.saveState();
        orbit.enabled = false;
      }

    } else {
      // Pointer lock'u kapat
      if (document.pointerLockElement === gl.domElement) {
        document.exitPointerLock();
      }
      pointerLocked.current = false;
      yawOffset.current     = 0;
      pitchOffset.current   = PITCH_DEFAULT;
      transitionT.current   = 0;

      if (orbit) {
        orbit.enabled = true;
        orbit.reset();
        camera.position.copy(orbitPosSnap.current);
        camera.quaternion.copy(orbitQuatSnap.current);
        orbit.update();
      }
    }

    prevMode.current = cameraMode;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraMode, camera, orbitRef]);

  // Unmount'ta pointer lock'u kapat
  useEffect(() => {
    return () => {
      if (document.pointerLockElement === gl.domElement) {
        document.exitPointerLock();
      }
    };
  }, [gl.domElement]);

  // ── Her kare güncelleme ──────────────────────────────────────────────────────
  useFrame(() => {
    if (cameraMode === 'orbit') return;

    // ─ Çatı pozisyonu ('XYZ' — doğru sıra) ──────────────────────────────────
    _roverEuler.set(
      roverState.rotation[0],
      roverState.rotation[1],
      roverState.rotation[2],
      'XYZ', // ← useRoverAnimation extraction sırası ile eşleşmeli
    );
    _roverQuat.setFromEuler(_roverEuler);

    _roofOffset.copy(ROOF_LOCAL).applyQuaternion(_roverQuat);
    _roofWorld.set(
      roverState.position[0],
      roverState.position[1],
      roverState.position[2],
    ).add(_roofOffset);

    // ─ Geçiş ilerlet ─────────────────────────────────────────────────────────
    if (transitionT.current < 1.0) {
      transitionT.current = Math.min(transitionT.current + TRANSITION_SPD, 1.0);
    }

    // ─ Pointer Lock yoksa yaw/pitch yavaşça sıfırla ───────────────────────────
    if (!pointerLocked.current) {
      yawOffset.current   *= (1 - LOOK_RESET);
      pitchOffset.current += (PITCH_DEFAULT - pitchOffset.current) * LOOK_RESET;
      if (Math.abs(yawOffset.current) < 0.0002) yawOffset.current = 0;
      if (Math.abs(pitchOffset.current - PITCH_DEFAULT) < 0.001) {
        pitchOffset.current = PITCH_DEFAULT;
      }
    }

    // ─ FPV kamera yönelimi ───────────────────────────────────────────────────
    //
    // TEMEL PRENSİP: Kamera terrain roll/pitch'ini KESINLIKLE miras almaz.
    // Sadece 3 bağımsız rotasyon katmanı var:
    //   1. heading   — rover'ın XZ forward'ından elde edilir (saf azimut)
    //   2. yawOffset — kullanıcı sol/sağ mouse
    //   3. pitchOffset — kullanıcı yukarı/aşağı mouse
    //
    // Bu sayede rover kratere girip eğilse bile ufuk sabit kalır.

    // Adım 1: Saf heading (terrain-independent)
    const headingRad = getRoverHeadingRad(roverState.rotation as [number, number, number]);
    _headingQ.setFromAxisAngle(_worldUp, headingRad);

    // Adım 2: Kullanıcı yaw, world Y ekseni üzerinde
    _yawQ.setFromAxisAngle(_worldUp, yawOffset.current);

    // Adım 3: heading + yaw bileşiğini kur, ardından local X'i bul
    _targetQuat.copy(_headingQ).multiply(_yawQ);
    _pitchAxis.set(1, 0, 0).applyQuaternion(_targetQuat); // local X

    // Adım 4: Pitch (dikey bakış)
    _pitchQ.setFromAxisAngle(_pitchAxis, pitchOffset.current);

    // Sonuç: heading × yaw × pitch
    _targetQuat.multiply(_pitchQ);

    // ─ LERP / SLERP buffer'ları ───────────────────────────────────────────────
    smoothCamPos.current.lerp(_roofWorld, CAM_POS_LERP);

    // Shortest-arc slerp
    if (smoothCamQuat.current.dot(_targetQuat) < 0) {
      _targetQuat.set(-_targetQuat.x, -_targetQuat.y, -_targetQuat.z, -_targetQuat.w);
    }
    smoothCamQuat.current.slerp(_targetQuat, CAM_ROT_SLERP);

    // ─ Kameraya uygula (giriş animasyonu ile) ────────────────────────────────
    const alpha = easeInOutCubic(transitionT.current);
    if (transitionT.current >= 1.0) {
      camera.position.copy(smoothCamPos.current);
      camera.quaternion.copy(smoothCamQuat.current);
    } else {
      camera.position.lerpVectors(orbitPosSnap.current, smoothCamPos.current, alpha);
      camera.quaternion.slerpQuaternions(orbitQuatSnap.current, smoothCamQuat.current, alpha);
    }

    // ─ FOV geçişi ────────────────────────────────────────────────────────────
    const camP = camera as THREE.PerspectiveCamera;
    if (Math.abs(camP.fov - FPV_FOV) > 0.05) {
      camP.fov = THREE.MathUtils.lerp(camP.fov, FPV_FOV, TRANSITION_SPD * 2);
      camP.updateProjectionMatrix();
    }
  });

  return null;
}

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
