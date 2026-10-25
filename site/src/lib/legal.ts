import legal from '../../../config/legal.json';

export const publisher = {
  name: legal.publisherName,
  url: legal.publisherUrl || null,
  address: legal.publisherAddress || null,
  registration: legal.publisherRegistration || null,
  director: legal.publicationDirector || null,
};
export const nonProfessional: boolean = legal.publisherStatus === 'non_professional';
export const contactEmail: string = legal.contactEmail;
export const reportEmail: string = legal.reportEmail;
export const host = legal.host;
export const updatedAt: string = legal.updatedAt;

/** Identifiant GA4 valide, sinon null: sans lui, aucun script Google n'est charge et aucun bandeau n'est affiche. */
export const analyticsId: string | null = /^G-[A-Z0-9]{6,12}$/.test(legal.analytics.measurementId) ? legal.analytics.measurementId : null;
export const analyticsName: string = legal.analytics.provider;
