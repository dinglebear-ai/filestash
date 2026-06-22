"use client";

// 3D model viewer (legacy application_3d). Supports STL / OBJ / PLY / GLTF / GLB
// via three.js loaders, with orbit controls, lighting, and auto-fit camera.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

function fitCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const dist = maxDim / (2 * Math.tan((Math.PI * camera.fov) / 360));
  camera.position.set(center.x + dist, center.y + dist * 0.6, center.z + dist * 1.4);
  camera.near = dist / 100;
  camera.far = dist * 100;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

export default function ThreeViewer({ src, ext }: { src: string; ext: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const w = mount.clientWidth || 800;
    const h = mount.clientHeight || 600;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(1, 1, 1);
    scene.add(key);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;

    const material = new THREE.MeshStandardMaterial({ color: 0x29b6f6, metalness: 0.1, roughness: 0.6 });
    const onLoad = (object: THREE.Object3D) => {
      scene.add(object);
      fitCamera(camera, controls, object);
    };
    const onErr = () => setError("Couldn't load 3D model.");

    const e = ext.toLowerCase();
    try {
      if (e === "stl") {
        new STLLoader().load(src, (geo) => onLoad(new THREE.Mesh(geo, material)), undefined, onErr);
      } else if (e === "ply") {
        new PLYLoader().load(src, (geo) => { geo.computeVertexNormals(); onLoad(new THREE.Mesh(geo, material)); }, undefined, onErr);
      } else if (e === "obj") {
        new OBJLoader().load(src, onLoad, undefined, onErr);
      } else if (e === "gltf" || e === "glb") {
        new GLTFLoader().load(src, (g) => onLoad(g.scene), undefined, onErr);
      } else {
        setError("Unsupported 3D format.");
      }
    } catch {
      onErr();
    }

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const nw = mount.clientWidth, nh = mount.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, [src, ext]);

  return (
    <div className="relative h-full w-full">
      <div ref={mountRef} className="h-full w-full" />
      {error ? (
        <p className="absolute inset-0 flex items-center justify-center aurora-text-body text-[var(--aurora-error)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
