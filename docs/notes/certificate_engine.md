# Certificate Engine

This module is responsible for maintaining the private-key-infrastructure for the overall service.
It is driven by the CertificateRequests table in the database, which contains work to be performed by this module.

Furthermore, this module may also generate work for itself by inserting rows into the CertificateRequests table.  An example of this would be the orchestration of certificate rotation.

This module manages the TlsCertificates table in the database, which contains a row for each valid certificate in the service.  This includes the service's root certificate authority (CA), the CA for the interior router network, the CAs for individual application networks, and individual certificates signed by a subset of the above CAs.

The actual certificate generation and signing is done using the external cert-manager package.  The interface to cert-manager is via entities within the Kubernetes namespace in which the Service runs.  The relevant entities are Issuers, Certificates, and Secrets.