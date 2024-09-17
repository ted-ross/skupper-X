## Bugs
 - ~~Fix repeated/failed creation of connectors on the router~~
 - ~~Figure out the issue with incorrect return values from API functions~~
 - ~~Deleting sites and backbones causes exceptions to be repeatedly caught in the management controller~~
 - ~~There is a name-collision thing happening when a backbone is deleted and then re-created~~

## General Stuff
 - ~~Generalize and parameterize the "hash-sets" for site-to-management reconciliation allowing for greater flexibility in development~~
 - Use PG notifications instead of polling to detect database changes
 - Explore ways to virtualize the Kubernetes content on backbones/member-sites for non-kube environments
 - Consolidate string definitions
 - When reconciling changes that are immutable, delete the synced object and re-reconcile for the create
 - Do something sensible when AMQP destinations are no longer reachable (i.e. credit runs out)
 - Consider issuing temporary credentials so that the first site of a new backbone can be bootstrapped on another backbone
 - Set up router policies to restrict access to management-plane APIs
 - Router-feature: Use a PKI signature for the router configuration so the configuration cannot be altered
   - HMAC digest for the initial configuration that is signed by the router's private key
   - Digest is carried in the connection properties and is enforced by the connected router
   - If policy (or other security) configuration is altered after the initial startup, the router is shut down
   - Consider also sending the cryptographic signatures of the pod images in the connection properties
   - Inter-router/Edge connections are:
     - Authenticated via MTLS
     - Accepted only if the connecting site has an authentic initial configuration
 - Consider having the sites generate their own certificates and CSRs to be sync'd to the MC for signing
   - This would require the installation of openssl into the site-controller container image

## Backbone Feature Tasks
 - ~~In initial setup, specify which ingresses are needed on the site based on configured access points (skupperx-incoming configmap?)~~
 - ~~In site YAML, include outgoing peer-links to known access points~~
 - ~~Figure out how to establish connectivity from the management controller to the backbone~~
 - ~~Define the backbone-router-to-management-controller protocol and APIs~~
 - ~~Implement the link APIs inband to the management controller~~
 - ~~Demonstrate automatic backbone site bootstrap~~
 - ~~On initial creation for backbone sites, only include manage and peer incoming links~~
 - ~~Review the inband APIs to allow for full link updates at run time (add/remove links, rotate certificates)~~
 - ~~Review the API for coherence in the URL paths~~
 - ~~Review the module structure~~
 - ~~Ensure that Kube watches are working as expected~~
 - ~~Disable API for backbone-site config after the site has "checked in" with the management controller~~
 - ~~Define the APIs for the front-end~~
 - ~~Change the field validator to a validator/normalizer which returns a copy of the fields with their expected types~~
 - ~~Trigger hash updates and heartbeats to sites when relevant database changes occur~~
 - ~~Rename the site-controller image~~
 - ~~Consider adding a "metadata" field to the interiorsites table to store opaque (JSON) data from the front-end~~
 - ~~Provide guidance in the deployment of backbone sites - bootstrapping the first site; indicating which sites can be deployed in sequence - deployment-state~~
 - ~~Simplify the JSON fields in the bootstrap process to remove unneeded fields and depth~~
 - ~~Add a shell command in one of the site containers that extracts the host info for bootstrap-deployment~~
 - ~~Delete orphaned TlsCertificate records when their owners are deleted~~
 - ~~Use router names that are more descriptive and derived from the backbone site name~~
 - Clean up the async structure of the "prune" module
 - Add an entry point in the "prune" module to clean things up after objects are deleted
 - Add ingress capability for non-OpenShift kubernetes
 - Consider replacing the boolean ingress indication with "no-ingress", "any", or ingress-style suggestions
 - Add a PUT to allow backbones to be renamed
 - Add a "platform" column for sites - probably enumerated for formality
 - Return an error on the ingress-post (during bootstrap) if the input is not validated
 - Consider invitation-templates for backbones
   - Every new application network automatically comes with a set of pre-definied invitations which can be deleted or added-to

## VAN Feature Tasks
 - ~~Create non-backbone mode for the site-controller - disable ingress and other backbone-specific functions~~
 - ~~Add a claim-handshake module to the site-controller~~
 - ~~Design a mechanism by which invited sites become member sites~~
 - ~~Add interactive invitations so member-console action is needed before the claim is asserted~~
 - ~~Remove the skx-inject annotation for claim secrets as they are not needed in the router~~
 - ~~Add the User API for access to application networks, invitations, and member sites~~
 - Remove backbone-mode and replace with backbone-enabled, member-enabled, claim-enabled.  This allows a site to be a member and a backbone at the same time
 - Design the member API
   - ~~Site status and site activation~~
   - Active and inactive application state
 - Allow users to rename member sites (affects site-scope addressing) - Alternatively, consider a separate site-scope-prefix field.
 - Bug: Invitation can be created with a primary access that is not a 'member' access-point

## Application Definition Tasks
 - Define the data structures to support Skupper-v2 equivalent functionality
 - Implement APIs to access v2-equivalent functions
 - Define the data structures to support full application definition
 - Design the kube-state representation of the above data
 - Implement the synchronization of the kube-state to the management controller
 - Implement APIs to access the full application definition
 - Implement site-scoped service addressing
