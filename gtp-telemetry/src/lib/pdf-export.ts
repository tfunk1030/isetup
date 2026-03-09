import jsPDF from 'jspdf';
import type { SessionAnalysis } from './types';
import { SHOCK_VELOCITY } from './constants';

export async function exportPDF(analysis: SessionAnalysis): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 20;

  const addHeader = (text: string) => {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFontSize(14);
    doc.setTextColor(245, 158, 11); // accent
    doc.text(text, margin, y);
    y += 8;
    doc.setTextColor(226, 232, 240); // text
    doc.setFontSize(10);
  };

  const addRow = (label: string, value: string) => {
    if (y > 275) { doc.addPage(); y = 20; }
    doc.setTextColor(148, 163, 184); // textDim
    doc.text(label, margin, y);
    doc.setTextColor(226, 232, 240);
    doc.text(value, pageWidth - margin, y, { align: 'right' });
    y += 5;
  };

  const addSeparator = () => {
    y += 3;
    doc.setDrawColor(30, 41, 59);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
  };

  // Background
  doc.setFillColor(10, 14, 23);
  doc.rect(0, 0, pageWidth, doc.internal.pageSize.getHeight(), 'F');

  // Title
  doc.setFontSize(20);
  doc.setTextColor(226, 232, 240);
  doc.text('GTP Telemetry Report', margin, y);
  y += 10;

  // Session header
  addHeader('Session Info');
  addRow('Car', analysis.header.car);
  addRow('Track', analysis.header.track);
  addRow('Driver', analysis.header.driver);
  addRow('Air Temp', analysis.header.airTemp);
  addRow('Track Temp', analysis.header.trackTemp);
  addRow('Duration', analysis.header.duration);
  addRow('Brake Migration', analysis.header.hasBrakeMig ? 'YES' : 'NO');
  addSeparator();

  // Lap Times
  addHeader('Lap Times');
  const bestLap = analysis.lapTimes.find((l) => Math.abs(l.time - analysis.bestTime) < 0.01);
  addRow('Best Lap', bestLap?.timeStr || 'N/A');
  addRow('Spread', `${(Math.max(...analysis.lapTimes.map((l) => l.time)) - analysis.bestTime).toFixed(2)}s`);
  addRow('Valid Laps', String(analysis.validLaps.length));
  for (const lap of analysis.lapTimes) {
    addRow(`  Lap ${lap.lap}`, `${lap.timeStr}  (${lap.maxSpeed.toFixed(0)} km/h max)`);
  }
  addSeparator();

  // Tyre Temps
  if (analysis.tyreTempData.length > 0) {
    addHeader('Tyre Temperatures (Last Lap)');
    const last = analysis.tyreTempData[analysis.tyreTempData.length - 1];
    for (const corner of ['LF', 'RF', 'LR', 'RR'] as const) {
      const d = last[corner];
      const avg = ((d.O + d.M + d.I) / 3).toFixed(1);
      addRow(`${corner}`, `O:${d.O.toFixed(1)} M:${d.M.toFixed(1)} I:${d.I.toFixed(1)}  avg:${avg}\u00B0C`);
    }
    addSeparator();
  }

  // Pressures
  if (analysis.tyrePressureData.length > 0) {
    addHeader('Tyre Pressures (Last Lap, PSI)');
    const last = analysis.tyrePressureData[analysis.tyrePressureData.length - 1];
    addRow('LF', `${last.LF.toFixed(1)} PSI`);
    addRow('RF', `${last.RF.toFixed(1)} PSI`);
    addRow('LR', `${last.LR.toFixed(1)} PSI`);
    addRow('RR', `${last.RR.toFixed(1)} PSI`);
    addSeparator();
  }

  // Platform
  addHeader('Aero Platform');
  addRow('Clean-Track Bottoming', String(analysis.bottoming.clean));
  addRow('Kerb Bottoming', String(analysis.bottoming.kerb));
  for (const [corner, d] of Object.entries(analysis.shockVelStats)) {
    const status = d.peak > SHOCK_VELOCITY.EXTREME ? ' [EXTREME]' : d.peak > SHOCK_VELOCITY.HIGH ? ' [HIGH]' : '';
    addRow(`${corner} Shock Peak`, `${d.peak.toFixed(0)} mm/s${status}`);
  }
  addSeparator();

  // G-Force
  addHeader('G-Force Envelope');
  addRow('Peak Lateral', `${analysis.peakLatG.toFixed(2)} g`);
  addRow('Peak Braking', `${analysis.peakBrakeG.toFixed(2)} g`);
  addRow('Peak Accel', `${analysis.peakAccelG.toFixed(2)} g`);
  addSeparator();

  // Fuel
  addHeader('Fuel');
  addRow('Start', `${analysis.fuel.start.toFixed(1)} L`);
  addRow('End', `${analysis.fuel.end.toFixed(1)} L`);
  addRow('Per Lap', `${analysis.fuel.perLap.toFixed(2)} L`);
  addRow('Range', `~${Math.floor(analysis.fuel.range)} laps`);
  addSeparator();

  // Driver Aids
  addHeader('Driver Aids');
  for (const [name, d] of Object.entries(analysis.aids)) {
    const status = d.constant ? '' : ' [CHANGING]';
    addRow(name, `avg:${d.avg.toFixed(1)} range:${d.min.toFixed(1)}-${d.max.toFixed(1)}${status}`);
  }
  addSeparator();

  // Conditioning
  if (analysis.conditioning) {
    addHeader('Tyre Conditioning');
    for (const [corner, d] of Object.entries(analysis.conditioning)) {
      const lapsStr = d.lapsTo85 < 50 ? ` (${d.lapsTo85} laps to 85\u00B0C)` : '';
      addRow(corner, `${d.rate > 0 ? '+' : ''}${d.rate.toFixed(1)}\u00B0C/lap${lapsStr}`);
    }
    addSeparator();
  }

  // Engine Temps
  if (analysis.engineTemps.length > 0) {
    addHeader('Engine Temperatures');
    const last = analysis.engineTemps[analysis.engineTemps.length - 1];
    addRow('Water (last lap)', `${last.waterTemp.toFixed(1)}\u00B0C`);
    addRow('Oil (last lap)', `${last.oilTemp.toFixed(1)}\u00B0C`);
  }

  // Save
  const filename = `GTP_Report_${analysis.header.car.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
