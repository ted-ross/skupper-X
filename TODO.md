## Bugs
 - ~~Fix repeated/failed creation of connectors on the router~~
 - ~~Figure out the issue with incorrect return values from API functions~~

## Backbone Feature Tasks
 - ~~In initial setup, specify which ingresses are needed on the site based on configured access points (skupperx-incoming configmap?)~~
 - ~~In site YAML, include outgoing peer-links to known access points~~
 - ~~Figure out how to establish connectivity from the management controller to the backbone~~
 - ~~Define the backbone-router-to-management-controller protocol and APIs~~
 - ~~Implement the link APIs inband to the management controller~~
 - ~~Demonstrate automatic backbone site bootstrap~~
 - ~~On initial creation for backbone sites, only include manage and peer incoming links~~
 - ~~Review the inband APIs to allow for full link updates at run time (add/remove links, rotate certificates)~~
 - Review the API for coherence in the URL paths
 - Review the module structure
 - ~~Ensure that Kube watches are working as expected~~
 - ~~Disable API for backbone-site config after the site has "checked in" with the management controller~~
 - ~~Define the APIs for the front-end~~
 - Use PG notifications instead of polling to detect database changes
 - Explore ways to virtualize the Kubernetes content on backbones/member-sites for non-kube environments
 - ~~Change the field validator to a validator/normalizer which returns a copy of the fields with their expected types~~
 - Clean up the async structure of the "prune" module
 - Add an entry point in the "prune" module to clean things up after objects are deleted
 - Consider replacing the boolean ingress indication with "no-ingress", "any", or ingress-style suggestions
 - Consolidate string definitions
 - When creating a link and there is no "peer" ingress on the listening site, either error out or create a peer ingress as a side effect
 - When reconciling changes that are immutable, delete the synced object and re-reconcile for the create

## VAN Feature Tasks

## Application Definition Tasks
