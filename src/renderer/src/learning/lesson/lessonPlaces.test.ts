import { lessonPlaces } from './lessonPlaces';

describe('lessonPlaces', () => {
  test('gives one place per page, labelling pages of a step with more than one', () => {
    // given
    const steps = [
      { name: 'One', pages: 1, body: () => null },
      { name: 'Code', pages: 2, body: () => null },
      { name: 'Quiz', pages: 1, body: () => null },
    ];
    // when
    const places = lessonPlaces(steps);
    // then
    expect(places).toEqual([
      { step: 0, page: 0, label: 'One' },
      { step: 1, page: 0, label: 'Code (1 of 2)' },
      { step: 1, page: 1, label: 'Code (2 of 2)' },
      { step: 2, page: 0, label: 'Quiz' },
    ]);
  });
});
