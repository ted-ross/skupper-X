# State and Configuration Objects

## Site

### TLS Profile Secrets

 - metadata
   - annotations
     - skupperx/skx-inject (name of a router SslProfile to create that references the content of the secret)

### ConfigMaps

#### skupperx-incoming

This config map indicates to to the site controller (of an interior router) which ingresses are to be exposed.  The data consists of an entry per desired ingress:

 - data
   - manage : true
   - peer : true
   - claim : true
   - member : true

If the element for a particular ingress is present and true, the site controller shall maintain an ingress by any available mechanism for that function.  If the element is absent, the ingress shall not be maintained.

#### skupperx-outgoing

This config map contains an entry per outgoing link (inter-router or edge).  Each entry is keyed using a unique UUID with a value that is a JSON string describing the remote access point (host and port), and the cost of the link for routing purposes.

 - data
   - UUID : JSON({host, port, cost})

The SslProfile for each link is assumed to be skx-site-client and the role of the connector is either inter-router or edge depending on the type of site in use.