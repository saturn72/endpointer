// Package versioning computes the next major.minor version for an endpoint.
package versioning

// NextVersion returns the (major, minor) pair to assign to the next version
// of an endpoint.
//
// If exists is false (no prior version for this endpoint exists), the first
// version is 1.0.
// Otherwise the minor is incremented within the current max major.
//
// Major-version bumping is a non-goal for this slice — the UI does not offer
// requesting one yet. Known gap: tracked in backlog.
func NextVersion(maxMajor, maxMinor int, exists bool) (major, minor int) {
	if !exists {
		return 1, 0
	}
	return maxMajor, maxMinor + 1
}
