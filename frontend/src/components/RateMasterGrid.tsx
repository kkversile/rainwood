'use client';

export const GRID_FIELDS = ['single', 'double', 'extraAdult', 'childWithBed', 'childWithoutBed'] as const;
export const CANONICAL_PLAN_ORDER = ['EP', 'CP', 'MAP', 'AP'] as const;
export type GridField = (typeof GRID_FIELDS)[number];
export type GridBand = 'RACK' | 'A' | 'B' | 'C' | 'D' | 'E';

export type GridRow = {
  band: GridBand;
  single: number;
  double: number;
  extraAdult: number;
  childWithBed: number;
  childWithoutBed: number;
  mixedFields: string[];
};

export type GridPlan = {
  ratePlanId: string;
  mealPlan: string;
  name: string;
  description: string;
  rows: GridRow[];
};

export type GridRoom = { id: string; code: string; name: string; plans: GridPlan[] };
export type RateMasterGridData = { hotel: { id: string; code: string; name: string; city: string } | null; from: string | null; to: string | null; rooms: GridRoom[] };

const FIELD_LABELS: Record<GridField, string> = {
  single: 'Single',
  double: 'Double',
  extraAdult: 'Extra Adult',
  childWithBed: 'Child With Bed',
  childWithoutBed: 'Child Without Bed',
};

type Props = {
  data: RateMasterGridData;
  expandedRooms: Set<string>;
  expandedPlans: Set<string>;
  onToggleRoom: (roomId: string) => void;
  onTogglePlan: (key: string) => void;
  onCellChange: (ratePlanId: string, band: GridBand, field: GridField, value: string) => void;
  onCopyRack: (ratePlanId: string) => void;
  onClearPlan: (ratePlanId: string) => void;
};

function rowFor(plan: GridPlan, band: GridBand) {
  return plan.rows.find((row) => row.band === band)!;
}

function planKey(roomId: string, ratePlanId: string) {
  return `${roomId}:${ratePlanId}`;
}

function rateInputValue(value: unknown): string {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? String(numericValue) : '0';
}

export function RateMasterGrid({ data, expandedRooms, expandedPlans, onToggleRoom, onTogglePlan, onCellChange, onCopyRack, onClearPlan }: Props) {
  if (!data.rooms.length) return <p className="empty rateGridEmpty">Select a hotel to load the Rate Master grid.</p>;
  return <div className="rateMasterGrid" data-testid="rate-master-grid">
    {data.rooms.map((room) => {
      const roomExpanded = expandedRooms.has(room.id);
      return <section className="rateGridRoom" key={room.id}>
        <header className="rateGridRoomHeader">
          <div><span className="rateGridCode">{room.code}</span><h2>{room.name}</h2><span className="rateGridPlanCount">{room.plans.length} canonical plans</span></div>
          <button className="smallBtn secondary" type="button" onClick={() => onToggleRoom(room.id)}>{roomExpanded ? 'Collapse room' : 'Expand room'}</button>
        </header>
        {roomExpanded && <div className="rateGridPlans">
          {[...room.plans].sort((left, right) => CANONICAL_PLAN_ORDER.indexOf(left.mealPlan as (typeof CANONICAL_PLAN_ORDER)[number]) - CANONICAL_PLAN_ORDER.indexOf(right.mealPlan as (typeof CANONICAL_PLAN_ORDER)[number])).map((plan) => {
            const key = planKey(room.id, plan.ratePlanId);
            const open = expandedPlans.has(key);
            const rack = rowFor(plan, 'RACK');
            return <section className="rateGridPlan" key={plan.ratePlanId}>
              <header className="rateGridPlanHeader">
                <div><strong>{plan.mealPlan} - {plan.name}</strong><span>{plan.description}</span></div>
                <div className="rateGridPlanActions">
                  <button className="textButton" type="button" onClick={() => onCopyRack(plan.ratePlanId)}>Copy Rack to A-E</button>
                  <button className="textButton" type="button" onClick={() => onClearPlan(plan.ratePlanId)}>Clear Plan</button>
                  <button className="textButton" type="button" onClick={() => onTogglePlan(key)}>{open ? 'Collapse plan' : 'Expand plan'}</button>
                </div>
              </header>
              {open && <div className="rateGridTableScroll"><table className="rateGridTable"><thead><tr><th>Category</th>{GRID_FIELDS.map((field) => <th key={field}>{FIELD_LABELS[field]} (₹)</th>)}</tr></thead><tbody>
                {(['RACK', 'A', 'B', 'C', 'D', 'E'] as GridBand[]).map((band) => {
                  const row = rowFor(plan, band);
                  return <tr className={band === 'RACK' ? 'rateGridRackRow' : ''} key={band}><th scope="row"><span>{band === 'RACK' ? 'Rack' : band}</span>{band === 'RACK' && <small>Base retail</small>}</th>{GRID_FIELDS.map((field) => {
                    return <td key={field}><div className="rateGridCell"><span>₹</span><input aria-label={`${room.name} ${plan.mealPlan} ${band === 'RACK' ? 'Rack' : `Category ${band}`} ${FIELD_LABELS[field]}`} type="number" inputMode="decimal" min="0" value={rateInputValue(row[field])} onChange={(event) => onCellChange(plan.ratePlanId, band, field, event.target.value)} /></div></td>;
                  })}</tr>;
                })}
              </tbody></table></div>}
            </section>;
          })}
        </div>}
      </section>;
    })}
  </div>;
}
