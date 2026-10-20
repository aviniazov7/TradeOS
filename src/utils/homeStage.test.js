import { describe, expect, it } from 'vitest';
import { homeStage } from './homeStage';

describe('homeStage', () => {
  it('leads an empty, unconnected account to connect an exchange', () => {
    expect(homeStage()).toBe('fresh');
    expect(homeStage({ closedTrades: 0, exchangeConnected: false })).toBe('fresh');
  });

  it('asks for a first trade once an exchange is connected', () => {
    expect(homeStage({ closedTrades: 0, exchangeConnected: true })).toBe('awaiting');
  });

  it('shows the book, and still offers connect, when trades were logged by hand', () => {
    expect(homeStage({ closedTrades: 3, exchangeConnected: false })).toBe('manual');
  });

  it('shows the overview once a connected account has closed trades', () => {
    expect(homeStage({ closedTrades: 1, exchangeConnected: true })).toBe('active');
  });
});
