import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LovesEditor } from '../LovesEditor';

describe('LovesEditor', () => {
    it('renders title "What I Love" and interests list', () => {
        const interests = ['Photography', 'Jazz music', 'Morning coffee'];
        const onSave = vi.fn();

        render(<LovesEditor interests={interests} onSave={onSave} />);

        expect(screen.getByText('What I Love')).toBeInTheDocument();
        expect(screen.getByText('Photography')).toBeInTheDocument();
        expect(screen.getByText('Jazz music')).toBeInTheDocument();
        expect(screen.getByText('Morning coffee')).toBeInTheDocument();
    });

    it('renders delete button for each item and calls onSave when clicked', () => {
        const interests = ['Coffee', 'Tea'];
        const onSave = vi.fn();

        render(<LovesEditor interests={interests} onSave={onSave} />);

        const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
        expect(deleteButtons).toHaveLength(2);

        fireEvent.click(deleteButtons[0]);
        expect(onSave).toHaveBeenCalledWith(['Tea']);
    });

    it('adds a new interest on submit and clears input', () => {
        const interests = ['Reading'];
        const onSave = vi.fn();

        render(<LovesEditor interests={interests} onSave={onSave} />);

        const input = screen.getByPlaceholderText('Add something you love...');
        fireEvent.change(input, { target: { value: 'Trail Running' } });
        fireEvent.submit(input.closest('form')!);

        expect(onSave).toHaveBeenCalledWith(['Reading', 'Trail Running']);
        expect((input as HTMLInputElement).value).toBe('');
    });

    it('does not add empty or whitespace-only interest', () => {
        const interests = ['Reading'];
        const onSave = vi.fn();

        render(<LovesEditor interests={interests} onSave={onSave} />);

        const input = screen.getByPlaceholderText('Add something you love...');
        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.submit(input.closest('form')!);

        expect(onSave).not.toHaveBeenCalled();
    });

    it('allows entering inline edit mode and saving on Enter', () => {
        const interests = ['Hiking', 'Biking'];
        const onSave = vi.fn();

        render(<LovesEditor interests={interests} onSave={onSave} />);

        const item = screen.getByText('Hiking');
        fireEvent.click(item);

        const editInput = screen.getByDisplayValue('Hiking');
        expect(editInput).toBeInTheDocument();

        fireEvent.change(editInput, { target: { value: 'Mountain Hiking' } });
        fireEvent.keyDown(editInput, { key: 'Enter' });

        expect(onSave).toHaveBeenCalledWith(['Mountain Hiking', 'Biking']);
    });

    it('allows cancelling inline edit mode on Escape', () => {
        const interests = ['Hiking', 'Biking'];
        const onSave = vi.fn();

        render(<LovesEditor interests={interests} onSave={onSave} />);

        const item = screen.getByText('Hiking');
        fireEvent.click(item);

        const editInput = screen.getByDisplayValue('Hiking');
        fireEvent.change(editInput, { target: { value: 'Mountain Hiking' } });
        fireEvent.keyDown(editInput, { key: 'Escape' });

        expect(onSave).not.toHaveBeenCalled();
        expect(screen.getByText('Hiking')).toBeInTheDocument();
    });

    it('saves inline edit on blur', () => {
        const interests = ['Cooking'];
        const onSave = vi.fn();

        render(<LovesEditor interests={interests} onSave={onSave} />);

        const item = screen.getByText('Cooking');
        fireEvent.click(item);

        const editInput = screen.getByDisplayValue('Cooking');
        fireEvent.change(editInput, { target: { value: 'Baking' } });
        fireEvent.blur(editInput);

        expect(onSave).toHaveBeenCalledWith(['Baking']);
    });
});
