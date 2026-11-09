import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DreamEditor, type DreamEditorProps } from '../DreamEditor';

const IDENTITY = { text: 'I am a gentleman, a father, and retired.', title: 'Gentleman, Father, Retired' };

function editor(props: Partial<DreamEditorProps> = {}) {
    const all: DreamEditorProps = {
        identity: IDENTITY,
        dreamLiving: '',
        dreamFinancial: '',
        onSave: vi.fn(),
        onSaveIdentity: vi.fn(),
        ...props,
    };
    return { ...render(<DreamEditor {...all} />), props: all };
}

const living = () => screen.getByPlaceholderText('Describe your dream living situation...');
const financial = () => screen.getByPlaceholderText('Describe your dream financial situation...');
const whoAreYou = () => screen.getByLabelText('Who are you?');

describe('DreamEditor', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders the title "My Dream"', () => {
        editor();
        expect(screen.getByText('My Dream')).toBeInTheDocument();
    });

    it('shows who they are, with the title their posts are signed with under it', () => {
        editor();
        expect(whoAreYou()).toHaveValue(IDENTITY.text);
        expect(screen.getByText('On your posts: Gentleman, Father, Retired')).toBeInTheDocument();
    });

    it('starts empty, with an "I am" prompt, when there is no identity yet', () => {
        editor({ identity: undefined });
        expect(whoAreYou()).toHaveValue('');
        expect(screen.getByPlaceholderText('I am…')).toBe(whoAreYou());
        expect(screen.queryByText(/On your posts/)).not.toBeInTheDocument();
    });

    it('saves who they are when they leave the field, trimmed, and only when it changed', () => {
        const { props } = editor();
        fireEvent.blur(whoAreYou());
        expect(props.onSaveIdentity).not.toHaveBeenCalled();

        fireEvent.change(whoAreYou(), { target: { value: ' I am calm and generous. ' } });
        act(() => {
            vi.advanceTimersByTime(5000);
        });
        // Not while typing: each save makes a new title
        expect(props.onSaveIdentity).not.toHaveBeenCalled();
        fireEvent.blur(whoAreYou());
        expect(props.onSaveIdentity).toHaveBeenCalledWith('I am calm and generous.');
        fireEvent.blur(whoAreYou());
        expect(props.onSaveIdentity).toHaveBeenCalledTimes(1);
        expect(props.onSave).not.toHaveBeenCalled();
    });

    it('saves who they are on unmount if it changed', () => {
        const { props, unmount } = editor();
        fireEvent.change(whoAreYou(), { target: { value: 'I am calm.' } });
        act(() => {
            unmount();
        });
        expect(props.onSaveIdentity).toHaveBeenCalledWith('I am calm.');
    });

    it('renders living situation and financial situation textareas with initial values', () => {
        editor({ dreamLiving: 'Living by the beach', dreamFinancial: 'No debt, high net worth' });

        expect(screen.getByText('Living Situation')).toBeInTheDocument();
        expect(screen.getByText('Financial')).toBeInTheDocument();
        expect(living()).toHaveValue('Living by the beach');
        expect(financial()).toHaveValue('No debt, high net worth');
    });

    it('debounces saving for 1 second on input changes', () => {
        const { props } = editor();
        fireEvent.change(financial(), { target: { value: 'Abundant' } });

        // Shouldn't be called immediately
        expect(props.onSave).not.toHaveBeenCalled();

        // Advance 500ms - still not called
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(props.onSave).not.toHaveBeenCalled();

        // Advance another 500ms (1000ms total)
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(props.onSave).toHaveBeenCalledTimes(1);
        expect(props.onSave).toHaveBeenCalledWith({ dream_living: '', dream_financial: 'Abundant' });
    });

    it('resets the debounce timer on consecutive keystrokes', () => {
        const { props } = editor();

        fireEvent.change(living(), { target: { value: 'Penthouse' } });
        act(() => {
            vi.advanceTimersByTime(600);
        });
        expect(props.onSave).not.toHaveBeenCalled();

        // Type again before 1 second expires
        fireEvent.change(living(), { target: { value: 'Penthouse in NYC' } });
        act(() => {
            vi.advanceTimersByTime(600);
        });
        // Still not called because timer was reset
        expect(props.onSave).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(400);
        });
        // Now reached 1000ms after second change
        expect(props.onSave).toHaveBeenCalledTimes(1);
        expect(props.onSave).toHaveBeenCalledWith({ dream_living: 'Penthouse in NYC', dream_financial: '' });
    });

    it('saves pending changes on unmount if dirty', () => {
        const { props, unmount } = editor();
        fireEvent.change(financial(), { target: { value: 'Independent wealth' } });

        // Unmount before the 1-second timer fires
        act(() => {
            unmount();
        });

        expect(props.onSave).toHaveBeenCalledTimes(1);
        expect(props.onSave).toHaveBeenCalledWith({ dream_living: '', dream_financial: 'Independent wealth' });
        expect(props.onSaveIdentity).not.toHaveBeenCalled();
    });

    it('does not save on unmount if there were no changes', () => {
        const { props, unmount } = editor({ dreamLiving: 'Cabin', dreamFinancial: 'Abundant' });
        act(() => {
            unmount();
        });
        expect(props.onSave).not.toHaveBeenCalled();
        expect(props.onSaveIdentity).not.toHaveBeenCalled();
    });

    it('does not save twice on unmount if timeout already fired', () => {
        const { props, unmount } = editor();
        fireEvent.change(living(), { target: { value: 'Lake house' } });

        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(props.onSave).toHaveBeenCalledTimes(1);

        act(() => {
            unmount();
        });
        // Still called only once
        expect(props.onSave).toHaveBeenCalledTimes(1);
    });

    it('does not overwrite user typing when parent re-renders with old props', () => {
        const { props, rerender } = editor({ dreamLiving: 'Old living', dreamFinancial: 'Old financial' });
        fireEvent.change(living(), { target: { value: 'New typing in progress...' } });

        // Parent rerenders with original props (e.g. before save completed)
        rerender(<DreamEditor {...props} />);

        expect(living()).toHaveValue('New typing in progress...');
    });
});
