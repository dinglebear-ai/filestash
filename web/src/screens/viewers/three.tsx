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
  const [failure, setFailure] = useState<{ src: string; message: string } | null>(null);
  const error = failure?.src === src ? failure.message : null;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const controller = new AbortController();
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
    const e = ext.toLowerCase();
    void (async () => {
      const response = await fetch(src, { credentials: "include", signal: controller.signal });
      if (!response.ok) throw new Error(`failed (${response.status})`);
      const data: string | ArrayBuffer = e === "obj" ? await response.text() : await response.arrayBuffer();
      if (e === "stl") onLoad(new THREE.Mesh(new STLLoader().parse(data as ArrayBuffer), material));
      else if (e === "ply") { const geometry = new PLYLoader().parse(data as ArrayBuffer); geometry.computeVertexNormals(); onLoad(new THREE.Mesh(geometry, material)); }
      else if (e === "obj") onLoad(new OBJLoader().parse(data as string));
      else if (e === "gltf" || e === "glb") new GLTFLoader().parse(data as ArrayBuffer, src.slice(0, src.lastIndexOf("/") + 1), (gltf) => onLoad(gltf.scene), (cause) => { throw cause; });
      else throw new Error("Unsupported 3D format.");
    })().catch((cause: Error) => { if (cause.name !== "AbortError") setFailure({ src, message: cause.message || "Couldn't load 3D model." }); });

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
      controller.abort();
      window.removeEventListener("resize", onResize);
      controls.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const current of materials) {
          for (const value of Object.values(current)) if (value instanceof THREE.Texture) value.dispose();
          current.dispose();
        }
      });
      material.dispose();
      renderer.renderLists.dispose();
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
