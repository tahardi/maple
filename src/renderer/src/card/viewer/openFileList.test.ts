import { close, openPreview, pin, type OpenFileList } from './openFileList';

type Row = {
  name: string;
  start: OpenFileList;
  action: (list: OpenFileList) => OpenFileList;
  want: OpenFileList;
};

const rows: Row[] = [
  {
    name: 'preview opens a file in an empty list',
    start: { files: [], preview: null },
    action: (list) => openPreview(list, 'a'),
    want: { files: ['a'], preview: 'a' },
  },
  {
    name: 'preview replaces the preview file in place',
    start: { files: ['x', 'a', 'y'], preview: 'a' },
    action: (list) => openPreview(list, 'b'),
    want: { files: ['x', 'b', 'y'], preview: 'b' },
  },
  {
    name: 'preview of an open pinned file changes nothing',
    start: { files: ['a', 'p'], preview: 'p' },
    action: (list) => openPreview(list, 'a'),
    want: { files: ['a', 'p'], preview: 'p' },
  },
  {
    name: 'preview appends when the preview file is no longer open',
    start: { files: ['x'], preview: 'a' },
    action: (list) => openPreview(list, 'b'),
    want: { files: ['x', 'b'], preview: 'b' },
  },
  {
    name: 'preview of the preview file changes nothing',
    start: { files: ['x', 'a'], preview: 'a' },
    action: (list) => openPreview(list, 'a'),
    want: { files: ['x', 'a'], preview: 'a' },
  },
  {
    name: 'pin keeps the preview file open',
    start: { files: ['a'], preview: 'a' },
    action: (list) => pin(list, 'a'),
    want: { files: ['a'], preview: null },
  },
  {
    name: 'pin appends a new file and leaves the preview alone',
    start: { files: ['a'], preview: 'a' },
    action: (list) => pin(list, 'b'),
    want: { files: ['a', 'b'], preview: 'a' },
  },
  {
    name: 'close of the preview file clears the preview',
    start: { files: ['x', 'a'], preview: 'a' },
    action: (list) => close(list, ['a']),
    want: { files: ['x'], preview: null },
  },
  {
    name: 'close of a pinned file keeps the preview',
    start: { files: ['x', 'a'], preview: 'a' },
    action: (list) => close(list, ['x']),
    want: { files: ['a'], preview: 'a' },
  },
  {
    name: 'close of many files clears the preview when it is among them',
    start: { files: ['x', 'a', 'y'], preview: 'a' },
    action: (list) => close(list, ['x', 'a']),
    want: { files: ['y'], preview: null },
  },
  {
    name: 'close of a file that is not open changes nothing',
    start: { files: ['a'], preview: 'a' },
    action: (list) => close(list, ['z']),
    want: { files: ['a'], preview: 'a' },
  },
];

describe('openFileList', () => {
  test.each(rows)('$name', ({ start, action, want }) => {
    // given
    const list = start;
    // when
    const got = action(list);
    // then
    expect(got).toEqual(want);
  });

  test('pin of an already pinned file returns the same list', () => {
    // given
    const list = { files: ['a'], preview: null };
    // when
    const got = pin(list, 'a');
    // then
    expect(got).toBe(list);
  });
});
