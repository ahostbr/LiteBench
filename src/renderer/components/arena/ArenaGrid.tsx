import type { BattleCompetitor } from '../../../shared/types';
import { CompetitorPane } from './CompetitorPane';

interface CompetitorState {
  status: import('../../../shared/types').CompetitorStatus;
  terminalLog: string;
  filesWritten: string[];
  previewUrl?: string;
}

interface ArenaGridProps {
  battleId: string;
  competitors: BattleCompetitor[];
  competitorStates: Map<string, CompetitorState>;
}

function getGridStyle(count: number): React.CSSProperties {
  if (count <= 2) {
    return { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' };
  }
  if (count === 3) {
    return { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' };
  }
  if (count === 4) {
    return { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' };
  }
  if (count <= 6) {
    return { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' };
  }
  if (count <= 8) {
    return { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' };
  }
  return {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
    gap: '8px',
  };
}

function getPaneStyle(index: number, count: number): React.CSSProperties {
  // 3 competitors: last item spans full width
  if (count === 3 && index === 2) {
    return { gridColumn: '1 / -1' };
  }
  return {};
}

export function ArenaGrid({ battleId, competitors, competitorStates }: ArenaGridProps) {
  const count = competitors.length;
  const gridStyle = getGridStyle(count);

  return (
    <div className="flex-1 min-h-0 p-2 overflow-auto">
      <div style={{ ...gridStyle, height: '100%', minHeight: 0 }}>
        {competitors.map((competitor, i) => {
          const state = competitorStates.get(competitor.id) ?? {
            status: competitor.status,
            terminalLog: '',
            filesWritten: [],
            previewUrl: undefined,
          };
          return (
            <div key={competitor.id} style={getPaneStyle(i, count)} className="min-h-0">
              <CompetitorPane
                competitor={competitor}
                state={state}
                battleId={battleId}
                index={i}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
