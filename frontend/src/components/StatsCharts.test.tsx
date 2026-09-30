/** @vitest-environment jsdom */
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {UnavailableChart, type UnavailableByDayData} from './StatsCharts';

vi.mock('recharts', async () => {
    const {createContext, useContext, cloneElement} = await import('react');
    type Day = UnavailableByDayData['days'][number];
    const ChartData = createContext<Day[]>([]);
    return {
        ResponsiveContainer: ({children}: {children: React.ReactNode}) => children,
        BarChart: ({data, children}: {data: Day[]; children: React.ReactNode}) => (
            <ChartData.Provider value={data}>{children}</ChartData.Provider>
        ),
        Tooltip: ({content}: {content: React.ReactElement}) => (
            <>{useContext(ChartData).map(day => (
                <div key={day.date} data-testid={day.date}>
                    {cloneElement(content, {active: true, label: day.date, payload: [{value: day.count, payload: day}]} as object)}
                </div>
            ))}</>
        ),
        Bar: () => null, Rectangle: () => null, XAxis: () => null, YAxis: () => null,
        CartesianGrid: () => null, Brush: () => null, Legend: () => null,
        LineChart: () => null, Line: () => null, ScatterChart: () => null, Scatter: () => null,
    };
});
afterEach(cleanup);

it('preserves per-channel counts through date backfilling and the initial-record toggle', () => {
    render(<UnavailableChart data={{total: 15, days: [
        {date: '2026-04-09', count: 10, sources: [{name: 'Older channel', path: 'older', count: 10}]},
        {date: '2026-04-11', count: 5, sources: [
            {name: 'Channel A', path: 'a', count: 3},
            {name: 'Unknown channel', path: '', count: 2},
        ]},
    ]}} />);
    expect(screen.queryByText('Older channel')).toBeNull();
    const tooltip = within(screen.getByTestId('2026-04-11'));
    expect(tooltip.getByText('Marked unavailable: 5')).toBeTruthy();
    expect(tooltip.getByText('Channel A').parentElement?.textContent).toBe('Channel A3');
    expect(tooltip.getByText('Unknown channel').parentElement?.textContent).toBe('Unknown channel2');
    expect(within(screen.getByTestId('2026-04-10')).getByText('Marked unavailable: 0')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', {name: 'Show initial record'}));
    expect(screen.getByText('Older channel')).toBeTruthy();
    expect(screen.getByText(/This first record may include/)).toBeTruthy();
});

it('limits long channel lists and includes the remaining unavailable count', () => {
    const sources = Array.from({length: 12}, (_, index) => ({name: `Channel ${index + 1}`, path: `${index}`, count: 12 - index}));
    render(<UnavailableChart data={{total: 78, days: [{date: '2026-04-09', count: 78, sources}]}} />);
    expect(screen.getByText('Channel 10')).toBeTruthy();
    expect(screen.queryByText('Channel 11')).toBeNull();
    expect(screen.getByText('+ 2 more channels: 3')).toBeTruthy();
});
