/**
 * External dependencies
 */
import emailValidator from 'email-validator';
import formatCurrency from '@automattic/format-currency';
import { get, includes, some, endsWith, mapValues } from 'lodash';
import i18n from 'i18n-calypso';

/**
 * Internal dependencies
 */
import { type as domainTypes } from 'lib/domains/constants';
import userFactory from 'lib/user';

/**
 * Constants
 */
const GSUITE_LINK_PREFIX = 'https://mail.google.com/a/';

/**
 * Applies a precision to the cost
 *
 * @param {Number} cost - cost
 * @param {Number} precision - precision to apply to cost
 * @returns {String} - Returns price with applied precision
 */
function applyPrecision( cost, precision ) {
	const exponent = Math.pow( 10, precision );
	return Math.ceil( cost * exponent ) / exponent;
}

/**
 * Can a domain add G Suite
 *
 * @param {String} domainName - domainname
 * @returns {Boolean} -Can a domain add G Suite
 */
function canDomainAddGSuite( domainName ) {
	const GOOGLE_APPS_INVALID_SUFFIXES = [ '.in', '.wpcomstaging.com' ];
	const GOOGLE_APPS_BANNED_PHRASES = [ 'google' ];
	const includesBannedPhrase = some( GOOGLE_APPS_BANNED_PHRASES, bannedPhrase =>
		includes( domainName, bannedPhrase )
	);
	const hasInvalidSuffix = some( GOOGLE_APPS_INVALID_SUFFIXES, invalidSuffix =>
		endsWith( domainName, invalidSuffix )
	);

	return ! ( hasInvalidSuffix || includesBannedPhrase || isGSuiteRestricted() );
}

/**
 * Formats price given cost and currency
 *
 * @param {Number} cost - cost
 * @param {String} currencyCode - currency code to format with
 * @param {Object} options - options containing precision
 * @returns {String} - Returns a formatted price
 */
function formatPrice( cost, currencyCode, options = {} ) {
	if ( undefined !== options.precision ) {
		cost = applyPrecision( cost, options.precision );
	}

	return formatCurrency( cost, currencyCode, cost % 1 > 0 ? {} : { precision: 0 } );
}

/**
 * Gets the formatted annual cost
 *
 * @param {Number} cost - cost
 * @param {String} currencyCode - currency code to format with
 * @returns {String} - Formatted Annual price
 */
function getAnnualPrice( cost, currencyCode ) {
	return formatPrice( cost, currencyCode );
}

/**
 * Retrieves the first domain that is eligible to G Suite either from the current selected site or the list of domains.
 *
 * @param {String} selectedDomainName - domain name for the site currently selected by the user
 * @param {Array} domains - list of domain objects
 * @returns {String} - Eligible domain name
 */
function getEligibleGSuiteDomain( selectedDomainName, domains ) {
	if ( selectedDomainName && canDomainAddGSuite( selectedDomainName ) ) {
		return selectedDomainName;
	}
	const [ eligibleDomain ] = getGSuiteSupportedDomains( domains );
	return ( eligibleDomain && eligibleDomain.name ) || '';
}

/**
 * Filters a list of domains by the domains that eligible for G Suite
 *
 * @param {Array} domains - list of domain objects
 * @returns {Array} - Array of G Suite supported domans
 */
function getGSuiteSupportedDomains( domains ) {
	return domains.filter( function( domain ) {
		const wpcomHosted =
			includes( [ domainTypes.REGISTERED ], domain.type ) &&
			( domain.hasWpcomNameservers || hasGSuite( domain ) );
		const mapped = includes( [ domainTypes.MAPPED ], domain.type );
		return ( wpcomHosted || mapped ) && canDomainAddGSuite( domain.name );
	} );
}

/**
 * Creates the Google ToS redirect url given email and domain
 *
 * @param {String} email - email
 * @param {String} domain - domain name
 * @returns {String} - ToS url redirect
 */
function getLoginUrlWithTOSRedirect( email, domain ) {
	return (
		'https://accounts.google.com/AccountChooser?' +
		`Email=${ encodeURIComponent( email ) }` +
		`&service=CPanel` +
		`&continue=${ encodeURIComponent(
			`https://admin.google.com/${ domain }/AcceptTermsOfService?continue=https://mail.google.com/mail/u/${ email }`
		) }`
	);
}

/**
 * Gets the formatted monthly cost
 *
 * @param {Number} cost - cost
 * @param {String} currencyCode - currency code to format with
 * @returns {String} - Formatted Monthly price
 */
function getMonthlyPrice( cost, currencyCode ) {
	return formatPrice( cost / 12, currencyCode );
}

/**
 * Returns G Suite management url
 *
 * @param {String} domainName - domain name
 * @returns {String} - Returns G Suite settings url
 */
function getGSuiteSettingsUrl( domainName ) {
	return GSUITE_LINK_PREFIX + domainName;
}

/**
 * Given a domain object, does that domain have G Suite
 *
 * @param {Object} domain - domain object
 * @returns {Boolean} - Does a domain have G Suite
 */
function hasGSuite( domain ) {
	return 'no_subscription' !== get( domain, 'googleAppsSubscription.status', '' );
}

/**
 * Given a list of domains does one of them support G Suite
 *
 * @param {Array} domains - list of domain objects
 * @returns {Boolean} - Does list of domains contain a G Suited supported domain
 */
function hasGSuiteSupportedDomain( domains ) {
	return getGSuiteSupportedDomains( domains ).length > 0;
}

/**
 * Does a domain have pending G Suite Users
 *
 * @param {Object} domain - domain object
 * @returns {Boolean} - Does domain have pending G Suite users
 */
function hasPendingGSuiteUsers( domain ) {
	return get( domain, 'googleAppsSubscription.pendingUsers.length', 0 ) !== 0;
}

/**
 * Is the user G Suite restricted
 *
 * @returns {Boolean} - Is the user G Suite restricted
 */
function isGSuiteRestricted() {
	const user = userFactory();
	return ! get( user.get(), 'is_valid_google_apps_country', false );
}

const removePreviousErrors = ( { value } ) => ( {
	value,
	error: null,
} );

const requiredField = ( { value, error } ) => ( {
	value,
	error:
		! error && ( ! value || '' === value ) ? i18n.translate( 'This field is required.' ) : error,
} );

const sixtyCharacterField = ( { value, error } ) => ( {
	value,
	error:
		! error && 60 < value.length
			? i18n.translate( "This field can't be longer than 60 characters." )
			: error,
} );

const validEmailCharacterField = ( { value, error } ) => ( {
	value,
	error:
		! error && ! /^[0-9a-z_'-](\.?[0-9a-z_'-])*$/i.test( value )
			? i18n.translate(
					'Only number, letters, dashes, underscores, apostrophes and periods are allowed.'
			  )
			: error,
} );

const validateOverallEmail = (
	{ value: mailBoxValue, error: mailBoxError },
	{ value: domainValue }
) => ( {
	value: mailBoxValue,
	error:
		! mailBoxError && ! emailValidator.validate( `${ mailBoxValue }@${ domainValue }` )
			? i18n.translate( 'Please provide a valid email address.' )
			: mailBoxError,
} );

function validateUser( user ) {
	// every field is required. Also scrubs previous errors.
	const { domain, mailBox, firstName, lastName } = mapValues( user, field =>
		requiredField( removePreviousErrors( field ) )
	);

	return {
		domain,
		mailBox: validateOverallEmail( validEmailCharacterField( mailBox ), domain ),
		firstName: sixtyCharacterField( firstName ),
		lastName: sixtyCharacterField( lastName ),
	};
}

export {
	canDomainAddGSuite,
	formatPrice,
	getAnnualPrice,
	getEligibleGSuiteDomain,
	getGSuiteSettingsUrl,
	getGSuiteSupportedDomains,
	getLoginUrlWithTOSRedirect,
	getMonthlyPrice,
	hasGSuite,
	hasGSuiteSupportedDomain,
	hasPendingGSuiteUsers,
	isGSuiteRestricted,
	validateUser,
};
