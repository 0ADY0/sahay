// Demo ward. Names are fictional. Replace with data from the backend later.
export const WARD = {
  name: 'Ward 4B',
  subtitle: 'Post-surgical recovery',
};

export const BEDS = [
  { id: 1, patient: 'R. Sharma' },
  { id: 2, patient: 'A. Iyer' },
  { id: 3, patient: 'M. Khan' },
  { id: 4, patient: 'S. Reddy' },
  { id: 5, patient: 'P. Das' },
  { id: 6, patient: 'K. Nair' },
  { id: 7, patient: 'V. Patel' },
  { id: 8, patient: 'L. Fernandes' },
];

export const bedById = (id) => BEDS.find((b) => b.id === Number(id));
