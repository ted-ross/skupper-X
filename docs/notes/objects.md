# State and Configuration Objects

## Site

### Secrets

 - metadata
   - name skx-site-<SITE_ID>
          skx-access-<ACCESS_POINT_ID>
   - annotations
     - skx/tls-inject: [site|accesspoint]
     - skx/tls-ordinal: NUMBER       (placeholder for future)
     - skx/tls-oldest-valid: NUMBER  (placeholder for future)

A secret with a tls-inject annotation will cause the creation of ah SslProfile on the router.  The name of the SslProfile depends on the tls-inject value:

For 'site', the SslProfile shall be named 'site-client'
For 'accesspoint', the SslProfile name shall be the same as the secret name.

The tls-ordinal and tls-oldest-valid annotations are used to manage the rotation and expiration of certificates.  When a new certificate is generated for the profile, the tls-ordinal is incremented.  The tls-oldest-valid ordinal is incremented when the certificate associated with the ordinal expires.  This is used by the router to pull down open connections that are still using the expired certificate.

### ConfigMaps

 - metadata
   - name skx-access-<ACCESS_POINT_ID>
          skx-link-<LINK_ID>
   - annotations
     - skx/state-type: [accesspoint|link]
     - skx/state-id: Database ID of the associated AccessPoint or Link
 - data (for accesspoint)
   - kind: [claim|peer|member|manage]
   - bindhost: optional host for socket bind
 - data (for link)
   - host
   - port
   - cost
