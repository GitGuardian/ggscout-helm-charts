#!/usr/bin/env node
/**
 * Fix all schema validation issues in the bundled JSON schema.
 *
 * This script addresses multiple structural problems:
 * 1. oneOf + properties at the same level (invalid JSON Schema)
 * 2. allOf patterns that need to be resolved
 * 3. $ref + properties combinations that need merging
 * 4. Any other structural issues that prevent validation
 *
 * The script works recursively through the entire schema to fix all instances.
 */

const fs = require('fs');
const path = require('path');

/**
 * Deep clone an object
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Resolve a $ref path within the schema
 */
function resolveRef(schema, refPath, currentDefs) {
  // Handle simple #/$defs/ references
  if (refPath.startsWith('#/$defs/')) {
    const refName = refPath.replace('#/$defs/', '');
    if (currentDefs[refName]) {
      return deepClone(currentDefs[refName]);
    }
  }
  
  // Handle complex URL-encoded references like #/definitions/https%3A~1~1gitguardian.com~1inventory-config/$defs/AkeylessAPIKeyAuth
  if (refPath.startsWith('#/definitions/')) {
    const parts = refPath.split('/$defs/');
    if (parts.length === 2) {
      const refName = parts[1];
      if (currentDefs[refName]) {
        return deepClone(currentDefs[refName]);
      }
    }
  }
  
  throw new Error(`Reference not found: ${refPath}`);
}

/**
 * Merge two schema objects, with overlay taking precedence
 */
function mergeSchemaObjects(base, overlay) {
  const result = deepClone(base);
  
  for (const [key, value] of Object.entries(overlay)) {
    if (key === 'required' && result[key]) {
      // Merge required arrays, remove duplicates
      result[key] = [...new Set([...result[key], ...value])];
    } else if (key === 'properties' && result[key]) {
      // Merge properties objects
      result[key] = { ...result[key], ...value };
    } else {
      // Override other properties
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Resolve an allOf array by merging all items
 */
function resolveAllOf(schema, allOfItems, currentDefs) {
  let result = { type: 'object', properties: {}, required: [] };
  
  for (const item of allOfItems) {
    let mergedItem;
    
    // Resolve any $ref in the item
    if (item.$ref) {
      try {
        const refResolved = resolveRef(schema, item.$ref, currentDefs);
        // Remove $ref and merge with any other properties in this item
        const itemWithoutRef = { ...item };
        delete itemWithoutRef.$ref;
        
        if (Object.keys(itemWithoutRef).length > 0) {
          mergedItem = mergeSchemaObjects(refResolved, itemWithoutRef);
        } else {
          mergedItem = refResolved;
        }
      } catch (e) {
        console.warn(`Warning: Could not resolve $ref ${item.$ref}: ${e.message}`);
        mergedItem = item;
      }
    } else {
      mergedItem = item;
    }
    
    // Merge this item into the result
    result = mergeSchemaObjects(result, mergedItem);
  }
  
  return result;
}

/**
 * Recursively fix schema structure issues
 */
function fixSchemaStructure(obj, schema, currentDefs) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    if (Array.isArray(obj)) {
      return obj.map(item => 
        typeof item === 'object' && item !== null 
          ? fixSchemaStructure(item, schema, currentDefs) 
          : item
      );
    }
    return obj;
  }
  
  // Handle oneOf + properties/required at same level
  if (obj.oneOf && (obj.properties || obj.required)) {
    console.log('Fixing oneOf + properties combination...');
    
    const baseProperties = obj.properties || {};
    const baseRequired = obj.required || [];
    const baseType = obj.type || 'object';
    
    // Process each oneOf branch
    const newOneOf = [];
    for (const branch of obj.oneOf) {
      let newBranch = deepClone(branch);
      
      // Recursively fix the branch first
      newBranch = fixSchemaStructure(newBranch, schema, currentDefs);
      
      // Ensure branch has required structure
      if (!newBranch.properties) newBranch.properties = {};
      if (!newBranch.required) newBranch.required = [];
      if (!newBranch.type) newBranch.type = 'object';
      
      // Merge base properties into this branch
      newBranch.properties = { ...newBranch.properties, ...baseProperties };
      newBranch.required = [...new Set([...newBranch.required, ...baseRequired])];
      
      newOneOf.push(newBranch);
    }
    
    // Return fixed object with only oneOf and type
    return {
      type: baseType,
      oneOf: newOneOf
    };
  }
  
  // Handle oneOf with allOf branches
  else if (obj.oneOf) {
    const newOneOf = [];
    for (const branch of obj.oneOf) {
      if (branch && typeof branch === 'object') {
        if (branch.allOf) {
          // Resolve allOf to a single merged object
          try {
            const resolvedAllOf = resolveAllOf(schema, branch.allOf, currentDefs);
            // Merge any other properties from this branch
            const branchWithoutAllOf = { ...branch };
            delete branchWithoutAllOf.allOf;
            
            const merged = Object.keys(branchWithoutAllOf).length > 0
              ? mergeSchemaObjects(resolvedAllOf, branchWithoutAllOf)
              : resolvedAllOf;
            
            newOneOf.push(fixSchemaStructure(merged, schema, currentDefs));
          } catch (e) {
            console.warn(`Warning: Could not resolve allOf: ${e.message}`);
            newOneOf.push(fixSchemaStructure(branch, schema, currentDefs));
          }
        } else if (branch.$ref && Object.keys(branch).length > 1) {
          // Handle $ref + properties combination
          try {
            const refResolved = resolveRef(schema, branch.$ref, currentDefs);
            const branchWithoutRef = { ...branch };
            delete branchWithoutRef.$ref;
            const merged = mergeSchemaObjects(refResolved, branchWithoutRef);
            newOneOf.push(fixSchemaStructure(merged, schema, currentDefs));
          } catch (e) {
            console.warn(`Warning: Could not resolve $ref: ${e.message}`);
            newOneOf.push(fixSchemaStructure(branch, schema, currentDefs));
          }
        } else {
          newOneOf.push(fixSchemaStructure(branch, schema, currentDefs));
        }
      } else {
        newOneOf.push(branch);
      }
    }
    
    // Update the oneOf and recursively fix other properties
    const result = { ...obj };
    result.oneOf = newOneOf;
    
    for (const [key, value] of Object.entries(result)) {
      if (key !== 'oneOf') {
        result[key] = fixSchemaStructure(value, schema, currentDefs);
      }
    }
    
    return result;
  }
  
  // Handle standalone allOf
  else if (obj.allOf) {
    try {
      const resolved = resolveAllOf(schema, obj.allOf, currentDefs);
      // Merge any other properties from this object
      const objWithoutAllOf = { ...obj };
      delete objWithoutAllOf.allOf;
      
      const merged = Object.keys(objWithoutAllOf).length > 0
        ? mergeSchemaObjects(resolved, objWithoutAllOf)
        : resolved;
      
      return fixSchemaStructure(merged, schema, currentDefs);
    } catch (e) {
      console.warn(`Warning: Could not resolve standalone allOf: ${e.message}`);
    }
  }
  
  // Handle $ref + properties combination
  else if (obj.$ref && Object.keys(obj).length > 1) {
    try {
      const refResolved = resolveRef(schema, obj.$ref, currentDefs);
      const objWithoutRef = { ...obj };
      delete objWithoutRef.$ref;
      const merged = mergeSchemaObjects(refResolved, objWithoutRef);
      return fixSchemaStructure(merged, schema, currentDefs);
    } catch (e) {
      console.warn(`Warning: Could not resolve $ref + properties: ${e.message}`);
    }
  }
  
  // Recursively process all other properties
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null) {
      result[key] = fixSchemaStructure(value, schema, currentDefs);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Fix the entire schema structure
 */
function fixEntireSchema(schema) {
  console.log('Starting comprehensive schema fix...');
  
  // Find all $defs sections
  const allDefs = {};
  
  // Look in definitions
  if (schema.definitions) {
    for (const [defKey, defValue] of Object.entries(schema.definitions)) {
      if (defValue && typeof defValue === 'object' && defValue.$defs) {
        Object.assign(allDefs, defValue.$defs);
      }
    }
  }
  
  // Start the recursive fix
  const fixedSchema = fixSchemaStructure(schema, schema, allDefs);
  
  console.log('Schema fix completed');
  return fixedSchema;
}

/**
 * Main function
 */
function main() {
  if (process.argv.length !== 3) {
    console.error('Usage: node fix-schema-structure.js <schema-file>');
    process.exit(1);
  }
  
  const schemaFile = process.argv[2];
  
  try {
    // Read the schema file
    const schemaContent = fs.readFileSync(schemaFile, 'utf8');
    const schema = JSON.parse(schemaContent);
    
    // Fix the entire schema
    const fixedSchema = fixEntireSchema(schema);
    
    // Write back to the same file
    fs.writeFileSync(schemaFile, JSON.stringify(fixedSchema, null, 2));
    
    console.log(`Successfully fixed all schema issues in ${schemaFile}`);
  } catch (error) {
    console.error(`Error processing schema: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script if called directly
if (require.main === module) {
  main();
}