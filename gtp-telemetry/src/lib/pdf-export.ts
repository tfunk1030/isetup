import jsPDF from 'jspdf';
import type { SessionAnalysis, SetupParameterGroup, SetupRecommendation } from './types';

const PAGE_HEIGHT_MM = 297;
const PAGE_WIDTH_MM = 210;
const MARGIN_MM = 16;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;

const GROUP_LABELS: Record<SetupParameterGroup, string> = {
  aero: 'Aero',
  platform: 'Platform',
  suspension: 'Suspension',
  dampers: 'Dampers',
  alignment: 'Alignment',
  brakes: 'Brakes',
  diff: 'Differential',
  tyres: 'Tyres',
  electronics: 'Electronics',
};

function formatLapTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '--';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
}

export async function exportPDF(analysis: SessionAnalysis): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = 18;

  const ensureSpace = (spaceNeeded = 8) => {
    if (y + spaceNeeded <= PAGE_HEIGHT_MM - MARGIN_MM) return;
    doc.addPage();
    paintBackground();
    y = 18;
  };

  const paintBackground = () => {
    doc.setFillColor(6, 10, 18);
    doc.rect(0, 0, PAGE_WIDTH_MM, PAGE_HEIGHT_MM, 'F');
  };

  const sectionTitle = (title: string, kicker?: string) => {
    ensureSpace(12);
    if (kicker) {
      doc.setFontSize(8);
      doc.setTextColor(127, 140, 166);
      doc.text(kicker.toUpperCase(), MARGIN_MM, y);
      y += 4;
    }
    doc.setFontSize(14);
    doc.setTextColor(244, 179, 71);
    doc.text(title, MARGIN_MM, y);
    y += 7;
  };

  const keyValue = (label: string, value: string) => {
    ensureSpace(6);
    doc.setFontSize(9);
    doc.setTextColor(127, 140, 166);
    doc.text(label, MARGIN_MM, y);
    doc.setTextColor(236, 242, 255);
    doc.text(value, PAGE_WIDTH_MM - MARGIN_MM, y, { align: 'right' });
    y += 5.5;
  };

  const paragraph = (text: string, color: [number, number, number] = [186, 199, 222]) => {
    const lines = doc.splitTextToSize(text, CONTENT_WIDTH_MM);
    ensureSpace(lines.length * 4 + 2);
    doc.setFontSize(9);
    doc.setTextColor(...color);
    doc.text(lines, MARGIN_MM, y);
    y += lines.length * 4 + 1.5;
  };

  const bulletList = (items: string[], limit = items.length) => {
    for (const item of items.slice(0, limit)) {
      const lines = doc.splitTextToSize(item, CONTENT_WIDTH_MM - 6);
      ensureSpace(lines.length * 4 + 1.5);
      doc.setFontSize(9);
      doc.setTextColor(186, 199, 222);
      doc.text('•', MARGIN_MM, y);
      doc.text(lines, MARGIN_MM + 4, y);
      y += lines.length * 4 + 1.5;
    }
  };

  const divider = () => {
    y += 1.5;
    ensureSpace(4);
    doc.setDrawColor(24, 36, 58);
    doc.line(MARGIN_MM, y, PAGE_WIDTH_MM - MARGIN_MM, y);
    y += 4;
  };

  const addRecommendation = (item: SetupRecommendation) => {
    ensureSpace(16);
    doc.setFillColor(10, 17, 29);
    doc.roundedRect(MARGIN_MM, y, CONTENT_WIDTH_MM, 18, 4, 4, 'F');
    doc.setDrawColor(137, 156, 190);
    doc.roundedRect(MARGIN_MM, y, CONTENT_WIDTH_MM, 18, 4, 4, 'S');

    doc.setFontSize(10);
    doc.setTextColor(236, 242, 255);
    doc.text(item.title, MARGIN_MM + 4, y + 5.5);

    doc.setFontSize(8);
    doc.setTextColor(127, 140, 166);
    doc.text(`${item.category} • ${item.severity} • ${item.confidence}`, PAGE_WIDTH_MM - MARGIN_MM - 4, y + 5.5, { align: 'right' });

    const actionSummary = item.specifics && item.specifics.length > 0
      ? item.specifics
        .slice(0, 2)
        .map((specific) => `${specific.parameter}: ${specific.current} -> ${specific.target} (${specific.delta})`)
        .join(' | ')
      : item.action;
    const actionLines = doc.splitTextToSize(actionSummary, CONTENT_WIDTH_MM - 8);
    doc.setTextColor(244, 179, 71);
    doc.text(actionLines, MARGIN_MM + 4, y + 10.5);
    y += 11 + Math.max(0, actionLines.length - 1) * 4;

    const rationaleLines = doc.splitTextToSize(item.rationale, CONTENT_WIDTH_MM - 8);
    doc.setTextColor(186, 199, 222);
    doc.text(rationaleLines, MARGIN_MM + 4, y + 2.5);
    y += rationaleLines.length * 4 + 4.5;
  };

  paintBackground();

  doc.setFontSize(9);
  doc.setTextColor(127, 140, 166);
  doc.text('iRacing Setup Optimizer', MARGIN_MM, y);
  y += 5;

  doc.setFontSize(20);
  doc.setTextColor(236, 242, 255);
  doc.text('Command-Center Report', MARGIN_MM, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(186, 199, 222);
  doc.text(`${analysis.header.car} • ${analysis.header.track}`, MARGIN_MM, y);
  y += 8;

  sectionTitle('Session Summary', 'overview');
  keyValue('Driver', analysis.header.driver);
  keyValue('Best Lap', formatLapTime(analysis.bestTime));
  keyValue('Valid Laps', String(analysis.validLaps.length));
  keyValue('Data Confidence', analysis.dataQuality.confidence);
  keyValue('Air / Track Temp', `${analysis.header.airTemp} / ${analysis.header.trackTemp}`);
  keyValue('Duration', analysis.header.duration);
  divider();

  sectionTitle('Optimizer Queue', 'exact changes first');
  const exactRecommendations = analysis.recommendations.filter(
    (item) => item.id !== 'all-clear' && (item.exactness === 'exact' || (item.specifics?.length ?? 0) > 0),
  );
  const exportRecommendations = (exactRecommendations.length > 0
    ? exactRecommendations
    : analysis.recommendations.filter((item) => item.id !== 'all-clear')).slice(0, 6);

  if (exportRecommendations.length === 0) {
    paragraph('No actionable setup recommendations were generated for this dataset.');
  } else {
    for (const recommendation of exportRecommendations) {
      addRecommendation(recommendation);
    }
  }
  divider();

  sectionTitle('Current Setup Snapshot', 'decoded garage data');
  const groupedParameters = new Map<SetupParameterGroup, typeof analysis.normalizedSetup.parameters>();
  for (const parameter of analysis.normalizedSetup.parameters) {
    const existing = groupedParameters.get(parameter.group) ?? [];
    existing.push(parameter);
    groupedParameters.set(parameter.group, existing);
  }

  for (const [group, parameters] of groupedParameters.entries()) {
    ensureSpace(8);
    doc.setFontSize(10);
    doc.setTextColor(236, 242, 255);
    doc.text(GROUP_LABELS[group], MARGIN_MM, y);
    y += 4.5;
    for (const parameter of parameters.slice(0, 6)) {
      keyValue(parameter.displayName, parameter.unit ? `${parameter.displayValue} ${parameter.unit}` : parameter.displayValue);
    }
    if (parameters.length > 6) {
      paragraph(`+${parameters.length - 6} more ${GROUP_LABELS[group].toLowerCase()} parameters in the app.`, [127, 140, 166]);
    }
    y += 1.5;
  }
  divider();

  sectionTitle('Confidence and Constraints', 'quality checks');
  paragraph(
    `Mapping quality: ${analysis.normalizedSetup.mappingStats.exact} exact, ${analysis.normalizedSetup.mappingStats.ordered} ordered, ${analysis.normalizedSetup.mappingStats.ambiguous} ambiguous.`,
  );
  if (analysis.dataQuality.notes.length > 0) {
    bulletList(analysis.dataQuality.notes, 4);
  }
  if (analysis.constraintViolations.length > 0) {
    paragraph('Constraint violations');
    bulletList(analysis.constraintViolations.map((item) => `${item.description}. ${item.workaround}`), 4);
  }
  if (analysis.physicsVersionNote) {
    paragraph(`Physics note: ${analysis.physicsVersionNote}`);
  }
  divider();

  sectionTitle('Evidence Appendix', 'compact support');
  const evidenceNotes = analysis.telemetryReasoning
    .filter((signal) => signal.direction !== 'stable')
    .slice(0, 5)
    .map((signal) => `${signal.summary} (${signal.phase}, ${signal.confidence})`);
  if (evidenceNotes.length > 0) {
    paragraph('Telemetry watch items');
    bulletList(evidenceNotes, 5);
  }
  if (analysis.trackGuidance) {
    paragraph('Track guidance');
    bulletList(analysis.trackGuidance.specialNotes, 4);
  }
  if (analysis.carDeepKnowledge) {
    paragraph('Car knowledge');
    bulletList(analysis.carDeepKnowledge.weaknesses, 4);
  }

  const filename = `GTP_Optimizer_${analysis.header.car.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
