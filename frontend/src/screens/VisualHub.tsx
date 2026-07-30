import { useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import ReactFlow, { Background, Controls } from 'reactflow'
import type { Node, Edge } from 'reactflow'
import 'reactflow/dist/style.css'
import { Panel } from '../components/ui'
import { demoDashboard, demoCandidates, demoTheses } from '../lib/demo'

function ThreeCommandDeck({ label }: { label: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x050714)

    const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.1, 100)
    camera.position.set(0, 2.5, 5)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.shadowMap.enabled = true
    el.appendChild(renderer.domElement)

    const ambient = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambient)
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(5, 10, 5)
    dir.castShadow = true
    scene.add(dir)

    const geometry = new THREE.BoxGeometry(1.6, 0.6, 1)
    const material = new THREE.MeshStandardMaterial({ color: 0x00e59b, metalness: 0.4, roughness: 0.2 })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.position.set(0, 0.4, 0)
    scene.add(mesh)

    const planeGeo = new THREE.PlaneGeometry(20, 20)
    const planeMat = new THREE.MeshStandardMaterial({ color: 0x050714 })
    const plane = new THREE.Mesh(planeGeo, planeMat)
    plane.receiveShadow = true
    plane.rotation.x = -Math.PI / 2
    plane.position.y = -0.3
    scene.add(plane)

    const labelDiv = document.createElement('div')
    labelDiv.style.position = 'absolute'
    labelDiv.style.color = 'white'
    labelDiv.style.fontWeight = '700'
    labelDiv.style.fontSize = '14px'
    labelDiv.innerText = label
    el.style.position = 'relative'
    el.appendChild(labelDiv)

    let raf = 0
    const animate = () => {
      mesh.rotation.y += 0.01
      renderer.render(scene, camera)
      raf = requestAnimationFrame(animate)
    }
    animate()

    const handleResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(el.clientWidth, el.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
      el.removeChild(renderer.domElement)
      if (labelDiv.parentNode === el) el.removeChild(labelDiv)
    }
  }, [label])

  return <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }} />
}

export default function VisualHub() {
  const dash = demoDashboard
  const equity = dash?.snapshot?.equity ?? 0

  const nodes: Node[] = useMemo(() => {
    const base: Node[] = demoCandidates.map((c, i) => ({
      id: c.id,
      position: { x: 20 + i * 200, y: 20 + (i % 3) * 120 },
      data: { label: `${c.instrument} (${c.score})` },
      style: { padding: 8, background: '#0d1220', color: '#e6f6ee', border: '1px solid #1f2a3f', width: 180 },
    }))
    const thesisNodes: Node[] = demoTheses.map((t, i) => ({
      id: t.id,
      position: { x: 20 + i * 220, y: 380 + (i % 2) * 120 },
      data: { label: `${t.instrument} · ${t.confidence}` },
      style: { padding: 8, background: '#071024', color: '#dbeffd', border: '1px solid #213043', width: 220 },
    }))
    return [...base, ...thesisNodes]
  }, [])

  const edges: Edge[] = useMemo(() => demoCandidates.map((c, i) => ({
    id: `e-${i}`,
    source: c.id,
    target: demoTheses[i % demoTheses.length].id,
    animated: true,
    style: { stroke: '#4dd3b6' },
  })), [])

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_520px]">
      <Panel title="3D Command Deck" subtitle="Interactive 3D overview" pad={false} className="min-h-[420px]">
        <div style={{ height: 420 }}>
          <ThreeCommandDeck label={`Equity $${(equity / 1000).toFixed(1)}k`} />
        </div>
      </Panel>

      <Panel title="Mind Map" subtitle="Organize ideas and positions" pad={false} className="min-h-[420px]">
        <div style={{ height: 420 }} className="reactflow-wrapper">
          <ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable nodesConnectable={false}>
            <Background gap={16} color="#07102a" />
            <Controls />
          </ReactFlow>
        </div>
      </Panel>
    </div>
  )
}
