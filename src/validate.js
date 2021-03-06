import Ajv from 'ajv';
import ajvKeywords from 'ajv-keywords';

import addAbsolutePathKeyword from './keywords/absolutePath';

import ValidationError from './ValidationError';

/** @typedef {import("json-schema").JSONSchema4} JSONSchema4 */
/** @typedef {import("json-schema").JSONSchema6} JSONSchema6 */
/** @typedef {import("json-schema").JSONSchema7} JSONSchema7 */
/** @typedef {import("ajv").ErrorObject} ErrorObject */

/** @typedef {(JSONSchema4 | JSONSchema6 | JSONSchema7)} Schema */

/** @typedef {ErrorObject & { children?: Array<ErrorObject>}} SchemaUtilErrorObject */

/**
 * @callback PostFormatter
 * @param {string} formattedError
 * @param {SchemaUtilErrorObject} error
 * @returns {string}
 */

/**
 * @typedef {Object} ValidationErrorConfiguration
 * @property {string=} name
 * @property {string=} baseDataPath
 * @property {PostFormatter=} postFormatter
 */

/** @typedef {import("ajv").Ajv} Ajv */
/**
 * @param {Object} options
 * @returns {Ajv}
 */
function getAjv(options){
  const ajv = new Ajv({
    allErrors: true,
    verbose: true,
    $data: true,
    ...options
  });

  ajvKeywords(ajv, [
    'instanceof',
    'formatMinimum',
    'formatMaximum',
    'patternRequired',
  ]);

  // Custom keywords
  return addAbsolutePathKeyword(ajv);
}

/**
 * @param {Schema} schema
 * @param {Array<object> | object} options
 * @param {ValidationErrorConfiguration=} configuration
 * @param {object=} ajvOptions
 * @returns {void}
 */
function validate(schema, options, configuration, ajvOptions) {
  let errors = [];

  if (Array.isArray(options)) {
    errors = Array.from(options).map((nestedOptions) =>
      validateObject(schema, nestedOptions, ajvOptions)
    );

    errors.forEach((list, idx) => {
      const applyPrefix =
        /**
         * @param {SchemaUtilErrorObject} error
         */
        (error) => {
          // eslint-disable-next-line no-param-reassign
          error.dataPath = `[${idx}]${error.dataPath}`;

          if (error.children) {
            error.children.forEach(applyPrefix);
          }
        };

      list.forEach(applyPrefix);
    });

    errors = errors.reduce((arr, items) => arr.concat(items), []);
  } else {
    errors = validateObject(schema, options, ajvOptions);
  }

  if (errors.length > 0) {
    throw new ValidationError(errors, schema, configuration);
  }
}

/**
 * @param {Schema} schema
 * @param {Array<object> | object} options
 * @param {object=} ajvOptions
 * @returns {Array<SchemaUtilErrorObject>}
 */
function validateObject(schema, options, ajvOptions) {
  const compiledSchema = getAjv(ajvOptions || {}).compile(schema);
  const valid = compiledSchema(options);

  if (!compiledSchema.errors) {
    return [];
  }

  return valid ? [] : filterErrors(compiledSchema.errors);
}

/**
 * @param {Array<ErrorObject>} errors
 * @returns {Array<SchemaUtilErrorObject>}
 */
function filterErrors(errors) {
  /** @type {Array<SchemaUtilErrorObject>} */
  let newErrors = [];

  for (const error of /** @type {Array<SchemaUtilErrorObject>} */ (errors)) {
    const { dataPath } = error;
    /** @type {Array<SchemaUtilErrorObject>} */
    let children = [];

    newErrors = newErrors.filter((oldError) => {
      if (oldError.dataPath.includes(dataPath)) {
        if (oldError.children) {
          children = children.concat(oldError.children.slice(0));
        }

        // eslint-disable-next-line no-undefined, no-param-reassign
        oldError.children = undefined;
        children.push(oldError);

        return false;
      }

      return true;
    });

    if (children.length) {
      error.children = children;
    }

    newErrors.push(error);
  }

  return newErrors;
}

// TODO change after resolve https://github.com/microsoft/TypeScript/issues/34994
validate.ValidationError = ValidationError;
validate.ValidateError = ValidationError;

export default validate;
