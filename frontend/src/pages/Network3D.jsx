import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { ArrowUpRight, CircleHelp, Maximize2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDashboard } from "../context/DashboardContext.jsx";
import { formatMoney, PageTitle, Panel, StateView } from "../components/common.jsx";

const COLORS = { high: "#ff2d55", medium: "#f4b740", normal: "#2e8bff" };

function createNetwork(transactions, alerts, limit) {
  const stats = new Map();
  const edges = new Map();
  const high = new Set();
  const medium = new Set();
  alerts.forEach((alert) => {
    if (alert.severity === "high") high.add(alert.account_id);
    if (alert.severity === "medium") medium.add(alert.account_id);
  });
  transactions.forEach((row) => {
    const sender = stats.get(row.sender_account_id) || { id: row.sender_account_id, sent: 0, received: 0, count: 0, volume: 0, rows: [] };
    sender.sent += row.amount;
    sender.count += 1;
    sender.volume += row.amount;
    sender.rows.push(row);
    stats.set(sender.id, sender);

    const receiver = stats.get(row.receiver_account_id) || { id: row.receiver_account_id, sent: 0, received: 0, count: 0, volume: 0, rows: [] };
    receiver.received += row.amount;
    receiver.count += 1;
    receiver.volume += row.amount;
    receiver.rows.push(row);
    stats.set(receiver.id, receiver);

    const key = `${row.sender_account_id}→${row.receiver_account_id}`;
    const edge = edges.get(key) || { source: row.sender_account_id, target: row.receiver_account_id, count: 0, amount: 0 };
    edge.count += 1;
    edge.amount += row.amount;
    edges.set(key, edge);
  });

  const accounts = [...stats.values()].sort((a, b) => b.volume - a.volume).slice(0, limit);
  const count = accounts.length;
  const radius = Math.max(3, Math.sqrt(count) * 0.85);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  accounts.forEach((account, index) => {
    const y = count <= 1 ? 0 : 1 - (index / (count - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = goldenAngle * index;
    account.position = [Math.cos(angle) * ring * radius, y * radius * 0.68, Math.sin(angle) * ring * radius];
    account.alertCount = alerts.filter((alert) => alert.account_id === account.id).length;
    account.color = high.has(account.id) ? COLORS.high : medium.has(account.id) ? COLORS.medium : COLORS.normal;
  });
  const included = new Set(accounts.map((account) => account.id));
  return {
    accounts,
    edges: [...edges.values()].filter((edge) => included.has(edge.source) && included.has(edge.target)),
  };
}

function AccountInstances({ accounts, onSelect, selectedId, setHovered }) {
  const meshRef = useRef();
  const scratch = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    accounts.forEach((account, index) => {
      scratch.position.set(...account.position);
      const selectedScale = account.id === selectedId ? 1.28 : 1;
      scratch.scale.setScalar(selectedScale);
      scratch.updateMatrix();
      mesh.setMatrixAt(index, scratch.matrix);
      color.set(account.color);
      mesh.setColorAt(index, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [accounts, color, scratch, selectedId]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, accounts.length]}
      onClick={(event) => {
        event.stopPropagation();
        const account = accounts[event.instanceId];
        if (account) onSelect(account);
      }}
      onPointerMove={(event) => {
        const account = accounts[event.instanceId];
        if (account) setHovered(account);
      }}
      onPointerOut={() => setHovered(null)}
      castShadow
      receiveShadow
    >
      <sphereGeometry args={[0.22, 18, 18]} />
      <meshStandardMaterial roughness={0.3} metalness={0.4} emissive="#101725" emissiveIntensity={0.45} />
    </instancedMesh>
  );
}

function NetworkEdges({ edges, positionById }) {
  const geometry = useMemo(() => {
    const positions = [];
    edges.forEach((edge) => {
      const from = positionById.get(edge.source);
      const to = positionById.get(edge.target);
      if (from && to) positions.push(...from, ...to);
    });
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return result;
  }, [edges, positionById]);
  return <lineSegments geometry={geometry}><lineBasicMaterial color="#4d607b" transparent opacity={0.48} /></lineSegments>;
}

function Pulse({ edge, positionById, index }) {
  const ref = useRef();
  const from = positionById.get(edge.source);
  const to = positionById.get(edge.target);
  useFrame(({ clock }) => {
    if (!ref.current || !from || !to) return;
    const progress = (clock.elapsedTime * 0.17 + index * 0.19) % 1;
    ref.current.position.set(
      from[0] + (to[0] - from[0]) * progress,
      from[1] + (to[1] - from[1]) * progress,
      from[2] + (to[2] - from[2]) * progress,
    );
  });
  if (!from || !to) return null;
  return <mesh ref={ref}><sphereGeometry args={[0.055, 8, 8]} /><meshBasicMaterial color="#a8d1ff" /></mesh>;
}

function NetworkScene({ model, selectedId, onSelect, setHovered }) {
  const positionById = useMemo(() => new Map(model.accounts.map((item) => [item.id, item.position])), [model.accounts]);
  return (
    <>
      <ambientLight intensity={0.8} />
      <pointLight position={[8, 8, 8]} intensity={1.4} color="#b4d2ff" />
      <NetworkEdges edges={model.edges} positionById={positionById} />
      {model.edges.slice(0, 28).map((edge, index) => <Pulse key={`${edge.source}-${edge.target}`} edge={edge} index={index} positionById={positionById} />)}
      <AccountInstances accounts={model.accounts} selectedId={selectedId} onSelect={onSelect} setHovered={setHovered} />
      <OrbitControls enableDamping dampingFactor={0.08} minDistance={4} maxDistance={25} />
    </>
  );
}

export default function Network3D() {
  const { transactions, alerts } = useDashboard();
  const navigate = useNavigate();
  const [limit, setLimit] = useState(20);
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const rows = transactions.data?.transactions || [];
  const alertRows = alerts.data?.alerts || [];
  const accountCount = new Set(rows.flatMap((row) => [row.sender_account_id, row.receiver_account_id])).size;
  const model = useMemo(() => createNetwork(rows, alertRows, limit), [rows, alertRows, limit]);

  return (
    <div className="page-wrap">
      <PageTitle eyebrow="ACCOUNT RELATIONSHIPS" title="Transaction Network" description="Explore account connections aggregated from transaction records returned by the API." actions={<label className="top-select"><Maximize2 size={14} /><span>Top accounts</span><select value={limit} onChange={(event) => setLimit(Number(event.target.value))}><option value={12}>12</option><option value={20}>20</option><option value={32}>32</option><option value={64}>64</option></select></label>} />
      <div className="dsa-note"><CircleHelp size={15} /> Node positions are computed once from the selected account set. Lines aggregate repeated transfers; moving points indicate direction only.</div>
      <div className="network-grid">
        <Panel title="Account transfer graph" subtitle={`${model.accounts.length} of ${accountCount} accounts · ${model.edges.length} aggregated connections`} className="network-panel">
          <StateView loading={transactions.loading && !transactions.data} error={transactions.error || alerts.error} empty={!rows.length} emptyText="No transaction records are available to build the network.">
            <div className="network-canvas">
              <Canvas camera={{ position: [0, 0, 13], fov: 48 }} dpr={[1, 1.5]}>
                <Suspense fallback={null}><NetworkScene model={model} selectedId={selected?.id} onSelect={setSelected} setHovered={setHovered} /></Suspense>
              </Canvas>
              {hovered ? <div className="network-hover" aria-live="polite"><strong>{hovered.id}</strong><span>{hovered.count} transactions · {formatMoney(hovered.volume)}</span></div> : null}
            </div>
          </StateView>
          <div className="network-legend"><span><i style={{ background: COLORS.normal }} /> Normal</span><span><i style={{ background: COLORS.medium }} /> Medium review signals</span><span><i style={{ background: COLORS.high }} /> High review signals</span></div>
        </Panel>
        <Panel title={selected ? selected.id : "Account details"} subtitle={selected ? "Selected account · actual API-derived totals" : "Select a node to inspect its activity"}>
          {selected ? (
            <div className="account-details">
              <div className="account-metrics"><span>Sent<strong>{formatMoney(selected.sent)}</strong></span><span>Received<strong>{formatMoney(selected.received)}</strong></span><span>Transactions<strong>{selected.count}</strong></span><span>Review signals<strong>{selected.alertCount}</strong></span></div>
              <h3>Related transactions</h3>
              <div className="related-list">
                {selected.rows.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 8).map((row) => (
                  <button type="button" key={row.transaction_id} onClick={() => navigate(`/transactions?focus=${row.transaction_id}`)}>
                    <span><b>#{row.transaction_id}</b><small>{row.sender_account_id} → {row.receiver_account_id}</small></span><strong>{formatMoney(row.amount)} <ArrowUpRight size={13} /></strong>
                  </button>
                ))}
              </div>
            </div>
          ) : <div className="state-view muted">Account details appear here after selecting a node.</div>}
        </Panel>
      </div>
    </div>
  );
}
