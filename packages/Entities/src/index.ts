export * from './generated/entity_subclasses.js';

/**
 * Forces the entity subclasses to be included in the build despite tree-shaking.
 * Call this from your application bootstrap.
 */
export function LoadGeneratedEntities() {
}
