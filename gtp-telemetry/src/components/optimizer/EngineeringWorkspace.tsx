import React, { useState, useMemo } from 'react';
import {
  Activity,
  Settings,
  AlertTriangle,
  ChevronRight,
  Maximize2,
  Filter,
  Crosshair,
  BarChart3,
  MousePointer2,
  FileText,
  Save,
  Clock,
  Zap,
} from 'lucide-react';

/**
 * ENGINEERING WORKSPACE
 * A high-density, mission-control style interface for race engineering.
 * This version is self-contained to ensure immediate playability and preview.
 */

// --- MOCK DATA & TYPES (Usually from session-store) ---
const MOCK_SESSION = {
  header: {
    carName: 'BMW M Hybrid V8',
    trackName: 'Watkins Glen - Boot',
    driverName: 'T. Funk'
  },
  laps: [1, 2, 3, 4, 5, 6, 7, 8],
  setup: {
    'Front Wing': '12.0 deg',
    'Rear Wing': '14.5 deg',
    'Front ARB': 'P4',
    'Rear ARB': 'P2',
    'Brake Bias': '54.2%',
    'F Spring Rate': '1200 lb/in',
    'R Spring Rate': '1050 lb/in',
    'F Ride Height': '52.4 mm',
    'R Ride Height': '68.1 mm',
    'Tire Pressure LF': '22.5 psi',
    'Tire Pressure RF': '22.6 psi',
    'Tire Pressure LR': '21.8 psi',
    'Tire Pressure RR': '21.9 psi'
  }
};

interface Finding {
  id: string;
  severity: string;
  category: string;
  title: string;
  description: string;
  zone: string;
  proposal: string;
  delta: string;
}

const MOCK_FINDINGS: Finding[] = [
  {
    id: 'f1',
    severity: 'critical',
    category: 'AERO',
    title: 'High-Speed Bottoming',
    description: 'Front splitter contact detected at T1 apex and Bus Stop entry. Loss of downforce and mechanical grip.',
    zone: 'Turn 1 & Bus Stop',
    proposal: 'Increase Front Spring Rate',
    delta: '+50 lb/in'
  },
  {
    id: 'f2',
    severity: 'advisory',
    category: 'TYRES',
    title: 'Pressure Saturation',
    description: 'Rear tires reaching 26 psi late in stint. Traction degradation observed on T7 exit.',
    zone: 'Laps 10+',
    proposal: 'Decrease Cold Pressure',
    delta: '-1.5 psi'
  },
  {
    id: 'f3',
    severity: 'stability',
    category: 'CHASSIS',
    title: 'Mid-Corner Oversteer',
    description: 'Unstable rear end through the laces. Driver reporting lack of confidence on throttle application.',
    zone: 'Turns 5-6',
    proposal: 'Soften Rear ARB',
    delta: 'P2 → P1'
  },
];

const EngineeringWorkspace: React.FC = () => {
  const [selectedFindingId, setSelectedFindingId] = useState<string>(MOCK_FINDINGS[0].id);
  const [activeTab, setActiveTab] = useState('telemetry');

  const activeFinding = useMemo(() =>
    MOCK_FINDINGS.find(f => f.id === selectedFindingId) || MOCK_FINDINGS[0]
  , [selectedFindingId]);

  return (
    <div className="h-full w-full bg-[#05070a] text-[#d1d5db] font-mono overflow-hidden flex flex-col antialiased">
      {/* 1. TOP BAR: SYSTEM STATUS */}
      <header className="h-14 border-b border-white/5 flex items-center justify-between px-6 shrink-0 bg-[#080a0f]">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 bg-orange-600 rounded-sm shadow-[0_0_15px_rgba(234,88,12,0.3)]">
              <Zap size={18} fill="white" className="text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-[12px] font-black tracking-tighter text-white uppercase leading-none">GTP OPTIMIZER</span>
              <span className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.2em]">Engineering Tier</span>
            </div>
          </div>

          <div className="h-6 w-[1px] bg-white/10" />

          <div className="flex gap-8">
            <StatusMetric icon={<Activity size={12}/>} label="CAR" value={MOCK_SESSION.header.carName.toUpperCase()} />
            <StatusMetric icon={<Crosshair size={12}/>} label="TRACK" value={MOCK_SESSION.header.trackName.toUpperCase()} />
            <StatusMetric icon={<Clock size={12}/>} label="SESSION" value="QUALIFYING" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-[11px] font-bold text-gray-300 rounded-sm">
            <Save size={14} />
            EXPORT PATCH
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 transition-colors text-[11px] font-black text-white rounded-sm shadow-[0_0_10px_rgba(234,88,12,0.2)]">
            <Zap size={14} fill="white" />
            RUN ENGINE
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 2. LEFT SIDEBAR: SETUP PERSISTENCE */}
        <aside className="w-64 border-r border-white/5 flex flex-col shrink-0 bg-[#06080c]">
          <div className="p-4 border-b border-white/5 bg-[#0a0c14] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings size={14} className="text-gray-500" />
              <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-400">Current Setup</h2>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {Object.entries(MOCK_SESSION.setup).map(([key, value], idx) => (
              <div key={key} className="group">
                {idx % 5 === 0 && (
                  <div className="px-4 py-1.5 text-[8px] font-black text-gray-600 uppercase tracking-widest bg-white/[0.01] border-b border-white/5">
                    SECTION 0{Math.floor(idx/5) + 1}
                  </div>
                )}
                <div className="flex items-center justify-between px-4 py-2.5 hover:bg-white/5 border-b border-white/5 transition-colors">
                  <span className="text-[10px] text-gray-500 group-hover:text-gray-300 truncate w-32">{key}</span>
                  <span className="text-[11px] font-bold tracking-tighter text-white">
                    {value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* 3. MAIN AREA: EVIDENCE & CHARTS */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#040508]">
          <div className="flex border-b border-white/5 px-4 bg-[#080a0f]">
            <WorkspaceTab label="Live Telemetry" active={activeTab === 'telemetry'} onClick={() => setActiveTab('telemetry')} icon={<Activity size={12} />} />
            <WorkspaceTab label="Stability Analysis" active={activeTab === 'stability'} onClick={() => setActiveTab('stability')} icon={<FileText size={12} />} />
            <WorkspaceTab label="Tyre History" active={activeTab === 'tyres'} onClick={() => setActiveTab('tyres')} icon={<BarChart3 size={12} />} />
          </div>

          <div className="flex-1 p-8 relative overflow-hidden flex flex-col">
            <div className="flex items-end justify-between mb-8">
              <div>
                <div className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                  <div className="w-3 h-[1px] bg-orange-500" />
                  Evidence Inspection
                </div>
                <h1 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">
                  {activeFinding.title}
                </h1>
              </div>

              <div className="flex gap-10">
                <div className="text-right">
                  <div className="text-[9px] font-bold text-gray-600 uppercase tracking-widest mb-1">Impact</div>
                  <div className="text-lg font-black text-cyan-400 leading-none">STABILITY +12%</div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-bold text-gray-600 uppercase tracking-widest mb-1">Proposal</div>
                  <div className="text-lg font-black text-white leading-none">{activeFinding.delta}</div>
                </div>
              </div>
            </div>

            {/* Visualizer Canvas */}
            <div className="flex-1 border border-white/10 rounded-sm bg-[#0a0c14] relative overflow-hidden shadow-[inset_0_0_40px_rgba(0,0,0,0.5)] group">
              <div className="absolute inset-0 bg-grid-pattern opacity-20 pointer-events-none" />

              {/* Fake Graph Content */}
              <div className="absolute inset-0 p-12 flex flex-col pointer-events-none">
                <div className="flex-1 relative">
                  {/* Critical Highlight Zone */}
                  <div className="absolute left-[25%] top-0 bottom-0 w-[15%] bg-red-500/5 border-x border-red-500/10 flex items-center justify-center">
                    <span className="text-[9px] font-bold text-red-500 uppercase -rotate-90 whitespace-nowrap opacity-50 tracking-widest">
                      BOTTOMING EVENT
                    </span>
                  </div>

                  {/* SVG Path for Telemetry */}
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 1000 300">
                    <path
                      d="M 0 150 Q 100 120, 200 180 T 400 140 T 600 200 T 800 150 T 1000 170"
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth="2.5"
                      className="drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]"
                    />
                    <path
                      d="M 0 160 Q 100 130, 200 190 T 400 150 T 600 210 T 800 160 T 1000 180"
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth="1.5"
                      strokeDasharray="6 3"
                      opacity="0.3"
                    />
                  </svg>
                </div>

                <div className="flex justify-between mt-4">
                  <div className="flex gap-6">
                    <LegendItem color="bg-cyan-400" label="PRIMARY TRACE" />
                    <LegendItem color="bg-red-500/40" label="REFERENCE LAP" />
                  </div>
                  <div className="text-[9px] font-bold text-gray-700 tracking-[0.3em] uppercase">X: LAP DISTANCE (0-5400m)</div>
                </div>
              </div>

              {/* Viewport Actions */}
              <div className="absolute bottom-6 right-6 flex gap-2">
                <IconButton icon={<Maximize2 size={14}/>} />
                <IconButton icon={<MousePointer2 size={14}/>} />
                <IconButton icon={<Filter size={14}/>} />
              </div>
            </div>
          </div>
        </main>

        {/* 4. RIGHT SIDEBAR: RECOMMENDATIONS QUEUE */}
        <aside className="w-80 border-l border-white/5 flex flex-col shrink-0 bg-[#080a0f]">
          <div className="p-4 border-b border-white/5 bg-[#0a0c14] flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-500">Analysis Queue</h2>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-[9px] font-bold text-gray-600 uppercase">Live</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {MOCK_FINDINGS.map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedFindingId(f.id)}
                className={`w-full text-left p-5 border transition-all relative overflow-hidden group ${
                  selectedFindingId === f.id
                  ? 'bg-orange-600/[0.08] border-orange-600/40 translate-x-1 shadow-lg shadow-black/40'
                  : 'bg-[#0a0c14] border-white/5 hover:border-white/10'
                } rounded-sm`}
              >
                <div className="flex items-center justify-between mb-3">
                   <div className={`px-2 py-0.5 text-[8px] font-black rounded-sm border ${
                     f.severity === 'critical' ? 'border-red-500/50 text-red-500 bg-red-500/10' : 'border-orange-500/50 text-orange-400 bg-orange-500/10'
                   }`}>
                     {f.severity.toUpperCase()}
                   </div>
                   <span className="text-[9px] text-gray-600 font-black uppercase tracking-widest">{f.category}</span>
                </div>

                <h3 className="text-[14px] font-black text-white mb-2 leading-tight tracking-tight uppercase italic group-hover:text-orange-400 transition-colors">
                  {f.title}
                </h3>
                <p className="text-[11px] text-gray-500 leading-relaxed mb-4 font-sans line-clamp-2">
                  {f.description}
                </p>

                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                   <div className="flex flex-col">
                     <span className="text-[8px] text-gray-600 font-black uppercase leading-none mb-1">PROPOSAL</span>
                     <span className="text-cyan-400 font-bold text-[12px] tracking-tighter">{f.delta}</span>
                   </div>
                   <ChevronRight size={16} className={`transition-transform ${selectedFindingId === f.id ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'}`} />
                </div>

                {selectedFindingId === f.id && (
                  <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-orange-600 shadow-[2px_0_10px_rgba(234,88,12,0.4)]" />
                )}
              </button>
            ))}
          </div>

          <div className="p-6 border-t border-white/5 bg-[#06080c]">
             <div className="flex items-center gap-3 mb-5 p-3 bg-white/[0.02] border border-white/5 rounded-sm">
                <AlertTriangle size={18} className="text-orange-500 animate-pulse" />
                <div>
                   <div className="text-[9px] text-gray-500 font-black uppercase tracking-widest">SYSTEM ALERT</div>
                   <div className="text-[11px] text-white font-bold tracking-tight italic">Manual validation required for T8 exit proposal</div>
                </div>
             </div>
             <button className="w-full py-4 bg-white/5 border border-white/10 hover:bg-orange-600 hover:text-white transition-all text-gray-400 text-[11px] font-black rounded-sm flex items-center justify-center gap-3 group tracking-widest uppercase italic">
                APPLY ALL PATCHES
                <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
             </button>
          </div>
        </aside>
      </div>

      <style>{`
        .bg-grid-pattern {
          background-image: linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 50px 50px;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.05);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.1);
        }
      `}</style>
    </div>
  );
};

// --- INTERNAL HELPERS ---
const StatusMetric: React.FC<{ icon: React.ReactNode, label: string, value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-3">
    <div className="text-gray-600 group-hover:text-gray-400 transition-colors">{icon}</div>
    <div className="flex flex-col">
      <span className="text-[8px] font-black text-gray-600 uppercase tracking-[0.2em] leading-none mb-1">{label}</span>
      <span className="text-[11px] font-black text-white tracking-tighter leading-none truncate max-w-[140px] italic">{value}</span>
    </div>
  </div>
);

const WorkspaceTab: React.FC<{ label: string, active: boolean, onClick: () => void, icon: React.ReactNode }> = ({ label, active, onClick, icon }) => (
  <button
    onClick={onClick}
    className={`px-8 py-4 flex items-center gap-2 border-b-2 transition-all group relative ${
      active ? 'border-orange-600 text-white bg-white/[0.03]' : 'border-transparent text-gray-600 hover:text-gray-400'
    }`}
  >
    <span className={active ? 'text-orange-500' : 'text-gray-700 group-hover:text-gray-500'}>{icon}</span>
    <span className="text-[10px] font-black uppercase tracking-[0.15em]">{label}</span>
    {active && <div className="absolute inset-0 bg-orange-600/5 blur-xl pointer-events-none" />}
  </button>
);

const IconButton: React.FC<{ icon: React.ReactNode }> = ({ icon }) => (
  <button className="w-10 h-10 flex items-center justify-center bg-[#0a0c14]/80 backdrop-blur-md border border-white/5 hover:border-white/20 hover:bg-gray-800 transition-all text-gray-500 hover:text-white rounded-sm shadow-xl">
    {icon}
  </button>
);

const LegendItem: React.FC<{ color: string, label: string }> = ({ color, label }) => (
  <div className="flex items-center gap-2">
    <div className={`w-3 h-0.5 ${color}`} />
    <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">{label}</span>
  </div>
);

export default EngineeringWorkspace;
