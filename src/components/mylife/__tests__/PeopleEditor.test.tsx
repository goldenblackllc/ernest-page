import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PeopleEditor } from '../PeopleEditor';
import { ProfilePerson } from '@/types/character';

describe('PeopleEditor', () => {
    const mockPeople: ProfilePerson[] = [
        {
            name: 'Sarah Connor',
            relationship: 'Partner',
            who: 'Engineer, loves sci-fi',
            dynamic: 'Supportive and adventurous',
            birthday: '1990-05-12',
        },
        {
            name: 'John Doe',
            relationship: 'Mentor',
            who: 'Retired professor',
            dynamic: 'Weekly coffee chats',
            birthday: '08-15',
        },
    ];

    it('renders title "My People" with Users icon', () => {
        const onSave = vi.fn();
        render(<PeopleEditor people={mockPeople} onSave={onSave} />);

        expect(screen.getByText('My People')).toBeInTheDocument();
    });

    it('renders people in collapsed view with Name and Relationship', () => {
        const onSave = vi.fn();
        render(<PeopleEditor people={mockPeople} onSave={onSave} />);

        expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
        expect(screen.getByText('Partner')).toBeInTheDocument();
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Mentor')).toBeInTheDocument();
    });

    it('expands person fields when tapping a collapsed row', () => {
        const onSave = vi.fn();
        render(<PeopleEditor people={mockPeople} onSave={onSave} />);

        // Not expanded initially
        expect(screen.queryByPlaceholderText('Full name')).not.toBeInTheDocument();

        // Tap first person row
        fireEvent.click(screen.getByText('Sarah Connor'));

        // Fields are now visible
        expect(screen.getByPlaceholderText('Full name')).toHaveValue('Sarah Connor');
        expect(screen.getByPlaceholderText('e.g. Partner, Friend, Coworker')).toHaveValue('Partner');
        expect(screen.getByPlaceholderText('Age, personality, interests...')).toHaveValue('Engineer, loves sci-fi');
        expect(screen.getByPlaceholderText('Your relationship with them...')).toHaveValue('Supportive and adventurous');
        expect(screen.getByPlaceholderText('MM-DD or YYYY-MM-DD')).toHaveValue('1990-05-12');

        // Labels are present
        expect(screen.getByLabelText(/Name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Relationship/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/About them/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Your dynamic/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Birthday/i)).toBeInTheDocument();
    });

    it('collapses previous person when tapping another person (accordion behavior)', () => {
        const onSave = vi.fn();
        render(<PeopleEditor people={mockPeople} onSave={onSave} />);

        // Expand first person
        fireEvent.click(screen.getByText('Sarah Connor'));
        expect(screen.getByDisplayValue('Sarah Connor')).toBeInTheDocument();

        // Expand second person
        fireEvent.click(screen.getByText('John Doe'));
        expect(screen.queryByDisplayValue('Sarah Connor')).not.toBeInTheDocument();
        expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument();
    });

    it('calls onSave on blur of any field', () => {
        const onSave = vi.fn();
        render(<PeopleEditor people={mockPeople} onSave={onSave} />);

        // Expand first person
        fireEvent.click(screen.getByText('Sarah Connor'));

        // Edit Name and blur
        const nameInput = screen.getByPlaceholderText('Full name');
        fireEvent.change(nameInput, { target: { value: 'Sarah Connor-Smith' } });
        fireEvent.blur(nameInput);

        expect(onSave).toHaveBeenCalledWith([
            {
                ...mockPeople[0],
                name: 'Sarah Connor-Smith',
            },
            mockPeople[1],
        ]);

        // Edit Relationship and blur
        const relInput = screen.getByPlaceholderText('e.g. Partner, Friend, Coworker');
        fireEvent.change(relInput, { target: { value: 'Spouse' } });
        fireEvent.blur(relInput);

        expect(onSave).toHaveBeenCalledWith([
            {
                ...mockPeople[0],
                name: 'Sarah Connor-Smith',
                relationship: 'Spouse',
            },
            mockPeople[1],
        ]);
    });

    it('deletes person when delete button in expanded view is clicked', () => {
        const onSave = vi.fn();
        render(<PeopleEditor people={mockPeople} onSave={onSave} />);

        // Expand first person
        fireEvent.click(screen.getByText('Sarah Connor'));

        // Click delete button
        const deleteBtn = screen.getByRole('button', { name: /delete/i });
        fireEvent.click(deleteBtn);

        expect(onSave).toHaveBeenCalledWith([mockPeople[1]]);
    });

    it('adds a new empty person and auto-focuses the name field', () => {
        const onSave = vi.fn();
        render(<PeopleEditor people={mockPeople} onSave={onSave} />);

        const addBtn = screen.getByText('+ Add a person');
        fireEvent.click(addBtn);

        // Name input of the new person should exist and be focused
        const nameInputs = screen.getAllByPlaceholderText('Full name');
        expect(nameInputs).toHaveLength(1);
        expect(nameInputs[0]).toHaveValue('');
        expect(document.activeElement).toBe(nameInputs[0]);

        // When blurred, onSave is called with the new empty person included
        fireEvent.change(nameInputs[0], { target: { value: 'Baby Yoda' } });
        fireEvent.blur(nameInputs[0]);

        expect(onSave).toHaveBeenCalledWith([
            mockPeople[0],
            mockPeople[1],
            { name: 'Baby Yoda', relationship: '' },
        ]);
    });
});
