import { isTyping } from './isTyping';

function inside(parentClass: string, tag: string): Element {
  const parent = document.createElement('div');
  parent.className = parentClass;
  const child = document.createElement(tag);
  parent.append(child);
  return child;
}

function editable(value: string): Element {
  const div = document.createElement('div');
  div.setAttribute('contenteditable', value);
  return div;
}

describe('isTyping', () => {
  test.each([
    { name: 'input', target: document.createElement('input'), typing: true },
    { name: 'textarea', target: document.createElement('textarea'), typing: true },
    { name: 'select', target: document.createElement('select'), typing: true },
    { name: 'contenteditable div', target: editable('true'), typing: true },
    { name: 'div in Monaco', target: inside('monaco-editor', 'div'), typing: true },
    { name: 'textarea in xterm', target: inside('xterm', 'textarea'), typing: true },
    { name: 'button', target: document.createElement('button'), typing: false },
    { name: 'body', target: document.body, typing: false },
    { name: 'contenteditable false div', target: editable('false'), typing: false },
    { name: 'null', target: null, typing: false },
  ])('$name is typing: $typing', ({ target, typing }) => {
    // given
    const event = target;
    // when
    const result = isTyping(event);
    // then
    expect(result).toBe(typing);
  });
});
