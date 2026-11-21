import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CoachScreen } from '@/screens/CoachScreen';
import { db } from '@/database/db';
import { createProgram, ensureSeeded } from '@/database/repository';
import { saveAccount } from '@/sync/auth';

afterEach(async () => {
  cleanup();
  await Promise.all(db.tables.map((table) => table.clear()));
});

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

function renderCoach() {
  return render(
    <MemoryRouter>
      <CoachScreen />
    </MemoryRouter>,
  );
}

it('describes the whole log before sign-in', async () => {
  await ensureSeeded();
  renderCoach();
  expect(await screen.findByText(/Ask about the whole log/)).toBeInTheDocument();
  await settle();
  expect(screen.getByText(/Sent to Gemini through tssamuel.com/)).toBeInTheDocument();
  expect(screen.getByText(/Sign in so this can use Gemini/)).toBeInTheDocument();
  expect(screen.queryByText(/Gemini reads every program/)).not.toBeInTheDocument();
});

it('keeps questions on every program and uses the picker only for an edit', async () => {
  await ensureSeeded();
  await createProgram('Legs');
  await saveAccount({ token: 'token', email: 'a@b.c', name: 'A', initialSyncDone: true });
  renderCoach();

  expect(await screen.findByText(/Gemini reads every program, the schedule, and the training log/)).toBeInTheDocument();
  await settle();
  expect(screen.queryByRole('tablist', { name: 'Program' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('radio', { name: 'Edit' }));
  await settle();

  expect(screen.getByText(/The change applies to the exercise you pick/)).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Minimalist Strength' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Legs' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pull-Up' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('radio', { name: 'Analyze' }));
  await settle();

  expect(screen.getByText(/Gemini reads every program, the schedule, and the training log/)).toBeInTheDocument();
  expect(screen.queryByRole('tablist', { name: 'Program' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Pull-Up' })).not.toBeInTheDocument();
});
