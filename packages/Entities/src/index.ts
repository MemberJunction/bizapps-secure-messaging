export * from './generated/entity_subclasses.js';
export * from './engine/SecureMessagingEngineBase.js';

/**
 * Forces the entity subclasses and engine to be included in the build despite tree-shaking.
 * Call this from your application bootstrap.
 */
export function LoadGeneratedEntities() {
}
