# State and Configuration Objects

## Certificates for sites and access points

There needs to be a notion of a "container" for certificate credentials so that there is a stable part of the data architecture during a certificate rotation.  Rather than formalize a "certificate container", the InteriorSite, MemberSite, and InteriorAccessPoint will serve as a container for their respective TlsCertificates.  Note that the TlsCertificate will be replaced with a new one at renewal-time during a rotation.

In practical terms, this means that SslProfiles, configured on the router pods, shall be correlated with the containing database record, not the TlsCertificate used to populate the SslProfile.  During rotation, the SslProfile shall be overwritten with the new certificate data and its rotation ordinals updated.

For the purpose of deriving values for the ordinals in the SslProfile (current version, last-valid-version), the TlsCertificate records shall have new attributes added:

  - RotationOrdinal - An ordinal that is incremented in the superceding TlsCertificate when a new certificate is generated to supercede an older one.
  - Supercedes - A reference to the TlsCertificate that was superceded when creating this TlsCertificate.

  Invariant:  this.RotationOrdinal = this.Supercedes.RotationOrdinal + 1

  Note that TlsCertificates will typically be kept in the database until they expire.

## Site

### Secrets

 - metadata
   - name skx-site-<SITE_ID>
          skx-access-<ACCESS_POINT_ID>
   - annotations
     - skx/tls-inject: [site|accesspoint]
     - skx/tls-ordinal: NUMBER
     - skx/tls-last-valid: NUMBER
     - skx/state-key: tls-site-<InteriorSites.Id>
                      tls-server-<BackboneAccessPoints.Id>
     - skx/state-hash: <hash>
     - skx/state-dir: remote

A secret with a tls-inject annotation will cause the create or update of an SslProfile on the router.  The name of the SslProfile depends on the tls-inject value:

For 'site', the SslProfile shall be named 'site-client'
For 'accesspoint', the SslProfile name shall be the same as the secret name.

The tls-ordinal and tls-oldest-valid annotations are used to manage the rotation and expiration of certificates.  When a new certificate is generated for the profile, the tls-ordinal is incremented.  The tls-oldest-valid ordinal is incremented when the certificate associated with the ordinal expires.  This may optionally be used by the router to close open connections that are still using the expired certificate.

### ConfigMaps

 - metadata
   - name skx-access-<ACCESS_POINT_ID>
          skx-link-<LINK_ID>
   - annotations
     - skx/state-type: [accesspoint|link]
     - skx/state-id: Database ID of the associated AccessPoint or Link
     - skx/state-key: access-<BackboneAccessPoints.Id>
                      link-<InterRouterLinks.Id>
     - skx/state-hash: <hash>
     - skx/state-dir: remote
 - data (for accesspoint)
   - kind: [claim|peer|member|manage]
   - bindhost: optional host for socket bind
 - data (for link)
   - host
   - port
   - cost
