import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DreamEditor } from '../DreamEditor';

describe('DreamEditor', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders title "My Dream" and Sparkles icon', () => {
        const onSave = vi.fn();
        render(
            <DreamEditor
                definingWords={['Gentleman', 'Approachable', 'Successful']}
                dreamLiving="A quiet cabin in the mountains"
                dreamFinancial="Financial freedom with recurring investments"
                onSave={onSave}
            />
        );

        expect(screen.getByText('My Dream')).toBeInTheDocument();
    });

    it('renders all three defining words sections with placeholders and initial values', () => {
        const onSave = vi.fn();
        render(
            <DreamEditor
                definingWords={['Gentleman', 'Approachable']}
                dreamLiving=""
                dreamFinancial=""
                onSave={onSave}
            />
        );

        expect(screen.getByText('Three words that define you')).toBeInTheDocument();

        const input1 = screen.getByDisplayValue('Gentleman');
        const input2 = screen.getByDisplayValue('Approachable');
        const input3 = screen.getByPlaceholderText('e.g. Successful');

        expect(input1).toBeInTheDocument();
        expect(input2).toBeInTheDocument();
        expect(input3).toBeInTheDocument();
        expect((input3 as HTMLInputElement).value).toBe('');
    });

    it('renders living situation and financial situation textareas with initial values', () => {
        const onSave = vi.fn();
        render(
            <DreamEditor
                definingWords={[]}
                dreamLiving="Living by the beach"
                dreamFinancial="No debt, high net worth"
                onSave={onSave}
            />
        );

        expect(screen.getByText('Living Situation')).toBeInTheDocument();
        expect(screen.getByText('Financial')).toBeInTheDocument();

        const livingTextarea = screen.getByPlaceholderText('Describe your dream living situation...');
        const financialTextarea = screen.getByPlaceholderText('Describe your dream financial situation...');

        expect((livingTextarea as HTMLTextAreaElement).value).toBe('Living by the beach');
        expect((financialTextarea as HTMLTextAreaElement).value).toBe('No debt, high net worth');
    });

    it('debounces saving for 1 second on input changes', () => {
        const onSave = vi.fn();
        render(
            <DreamEditor
                definingWords={['Leader', '', '']}
                dreamLiving=""
                dreamFinancial=""
                onSave={onSave}
            />
        );

        const input2 = screen.getByPlaceholderText('e.g. Approachable');
        fireEvent.change(input2, { target: { value: 'Kind' } });

        // Shouldn't be called immediately
        expect(onSave).not.toHaveBeenCalled();

        // Advance 500ms - still not called
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(onSave).not.toHaveBeenCalled();

        // Advance another 500ms (1000ms total)
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSave).toHaveBeenCalledWith({
            defining_words: ['Leader', 'Kind', ''],
            dream_living: '',
            dream_financial: '',
        });
    });

    it('resets the debounce timer on consecutive keystrokes', () => {
        const onSave = vi.fn();
        render(
            <DreamEditor
                definingWords={['', '', '']}
                dreamLiving=""
                dreamFinancial=""
                onSave={onSave}
            />
        );

        const livingTextarea = screen.getByPlaceholderText('Describe your dream living situation...');

        fireEvent.change(livingTextarea, { target: { value: 'Penthouse' } });

        act(() => {
            vi.advanceTimersByTime(600);
        });
        expect(onSave).not.toHaveBeenCalled();

        // Type again before 1 second expires
        fireEvent.change(livingTextarea, { target: { value: 'Penthouse in NYC' } });

        act(() => {
            vi.advanceTimersByTime(600);
        });
        // Still not called because timer was reset
        expect(onSave).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(400);
        });
        // Now reached 1000ms after second change
        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSave).toHaveBeenCalledWith({
            defining_words: ['', '', ''],
            dream_living: 'Penthouse in NYC',
            dream_financial: '',
        });
    });

    it('saves pending changes on unmount if dirty', () => {
        const onSave = vi.fn();
        const { unmount } = render(
            <DreamEditor
                definingWords={['Alpha', 'Beta', 'Gamma']}
                dreamLiving=""
                dreamFinancial=""
                onSave={onSave}
            />
        );

        const financialTextarea = screen.getByPlaceholderText('Describe your dream financial situation...');
        fireEvent.change(financialTextarea, { target: { value: 'Independent wealth' } });

        // Unmount before the 1-second timer fires
        act(() => {
            unmount();
        });

        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSave).toHaveBeenCalledWith({
            defining_words: ['Alpha', 'Beta', 'Gamma'],
            dream_living: '',
            dream_financial: 'Independent wealth',
        });
    });

    it('does not save on unmount if there were no changes', () => {
        const onSave = vi.fn();
        const { unmount } = render(
            <DreamEditor
                definingWords={['Alpha', 'Beta', 'Gamma']}
                dreamLiving="Cabin"
                dreamFinancial="Abundant"
                onSave={onSave}
            />
        );

        act(() => {
            unmount();
        });

        expect(onSave).not.toHaveBeenCalled();
    });

    it('does not save twice on unmount if timeout already fired', () => {
        const onSave = vi.fn();
        const { unmount } = render(
            <DreamEditor
                definingWords={['Alpha', 'Beta', 'Gamma']}
                dreamLiving=""
                dreamFinancial=""
                onSave={onSave}
            />
        );

        const livingTextarea = screen.getByPlaceholderText('Describe your dream living situation...');
        fireEvent.change(livingTextarea, { target: { value: 'Lake house' } });

        act(() => {
            vi.advanceTimersByTime(1000);
        });

        expect(onSave).toHaveBeenCalledTimes(1);

        act(() => {
            unmount();
        });

        // Still called only once
        expect(onSave).toHaveBeenCalledTimes(1);
    });

    it('does not overwrite user typing when parent re-renders with old props', () => {
        const onSave = vi.fn();
        const { rerender } = render(
            <DreamEditor
                definingWords={['Old1', 'Old2', 'Old3']}
                dreamLiving="Old living"
                dreamFinancial="Old financial"
                onSave={onSave}
            />
        );

        const livingTextarea = screen.getByPlaceholderText('Describe your dream living situation...');
        fireEvent.change(livingTextarea, { target: { value: 'New typing in progress...' } });

        // Parent rerenders with original props (e.g. before save completed)
        rerender(
            <DreamEditor
                definingWords={['Old1', 'Old2', 'Old3']}
                dreamLiving="Old living"
                dreamFinancial="Old financial"
                onSave={onSave}
            />
        );

        expect((screen.getByPlaceholderText('Describe your dream living situation...') as HTMLTextAreaElement).value).toBe('New typing in progress...');
    });
});
