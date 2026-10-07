import { describe, expect, it } from 'vitest';
import { DIALOG, DialogQueue } from './dialogQueue';

const line = (text: string, seconds = 3, speaker = 'Sleepy Coworker') => ({ speaker, text, seconds });

describe('dialog box queue', () => {
  it('types a line out, then closes it after its seconds', () => {
    const q = new DialogQueue();
    q.push(line('Hello there'), 10);
    expect(q.update(10)).toMatchObject({ chars: 0, typed: false });
    expect(q.update(10 + 5 / DIALOG.charsPerSecond)?.chars).toBe(5);
    expect(q.update(11)).toMatchObject({ chars: 11, typed: true });
    expect(q.update(12.9)).not.toBeNull();
    expect(q.update(13)).toBeNull();
    expect(q.open).toBe(false);
  });

  it('stays up long enough to read a long line', () => {
    const q = new DialogQueue();
    const text = 'x'.repeat(DIALOG.charsPerSecond * 4);
    q.push(line(text, 2), 0);
    expect(q.update(4.5)?.typed).toBe(true);
    expect(q.update(4 + DIALOG.minReadSeconds + 0.01)).toBeNull();
  });

  it('a tap finishes the typing, a second tap closes it', () => {
    const q = new DialogQueue();
    q.push(line('A fairly long line of text'), 0);
    q.advance(0.1);
    expect(q.update(0.1)).toMatchObject({ typed: true });
    q.advance(0.2);
    expect(q.update(0.2)).toBeNull();
  });

  it('a line arriving mid-typing waits its turn, then shows', () => {
    const q = new DialogQueue();
    q.push(line('first'), 0);
    q.push(line('second'), 0.05);
    expect(q.update(0.06)?.line.text).toBe('first');
    expect(q.waitingCount).toBe(1);
    expect(q.update(3)?.line.text).toBe('second');
  });

  it('a new line replaces one that has been readable for a moment', () => {
    const q = new DialogQueue();
    q.push(line('first', 6), 0);
    q.push(line('second'), 0.125 + DIALOG.replaceAfterSeconds + 0.1);
    expect(q.update(1.3)?.line.text).toBe('second');
  });

  it('ignores repeats and drops the oldest waiting line when too many pile up', () => {
    const q = new DialogQueue();
    q.push(line('now'), 0);
    q.push(line('now'), 0.01);
    expect(q.waitingCount).toBe(0);
    for (let i = 0; i < DIALOG.maxWaiting + 2; i++) q.push(line(`later ${i}`), 0.02);
    expect(q.waitingCount).toBe(DIALOG.maxWaiting);
    q.advance(0.03);
    q.advance(0.03);
    expect(q.update(0.03)?.line.text).toBe('later 2');
  });
});
