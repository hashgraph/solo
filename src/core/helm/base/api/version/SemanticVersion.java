/*
 * Copyright (C) 2022-2023 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package com.hedera.fullstack.base.api.version;

import static com.hedera.fullstack.base.api.util.StringUtils.*;

import com.hedera.fullstack.base.api.util.StringUtils;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A standard representation of a semantic version number.
 */
public record SemanticVersion(int major, int minor, int patch, String prerelease, String build)
        implements Comparable<SemanticVersion> {

    /**
     * Constant value representing a zero version number.
     */
    public static final SemanticVersion ZERO = new SemanticVersion(0, 0, 0, StringUtils.EMPTY, StringUtils.EMPTY);

    /**
     * A precompiled regular expression used to parse a semantic version string and extract the individual components.
     */
    private static final Pattern SEMVER_PATTERN = Pattern.compile('^'
            + "((\\d+)\\.(\\d+)\\.(\\d+))" // version string
            + "(?:-([\\dA-Za-z]+(?:\\.[\\dA-Za-z]+)*))?" // prerelease suffix (optional)
            + "(?:\\+([\\dA-Za-z\\-]+(?:\\.[\\dA-Za-z\\-]+)*))?" // build suffix (optional)
            + '$');

    /**
     * Constructs a new instance of a {@link SemanticVersion} with the supplied components.
     *
     * @param major      the major version.
     * @param minor      the minor version.
     * @param patch      the patch version.
     * @param prerelease the optional prerelease specifier.
     * @param build      the optional build specifier.
     */
    public SemanticVersion {
        prerelease = nullToBlank(prerelease);
        build = nullToBlank(build);
    }

    /**
     * Parses a semantic version string into the individual components.
     *
     * @param version a semantic version number in string form.
     * @return an instance of a {@link SemanticVersion} containing the individual components.
     * @throws InvalidSemanticVersionException if the supplied string cannot be parsed as a semantic version number.
     * @throws IllegalArgumentException        if the {@code version} argument is a {@code null} reference.
     */
    public static SemanticVersion parse(final String version) {
        Objects.requireNonNull(version, "version cannot be null");
        final Matcher matcher = SEMVER_PATTERN.matcher(version.trim());

        if (!matcher.matches()) {
            throw new InvalidSemanticVersionException(
                    String.format("The supplied version '%s' is not a valid semantic version", version));
        }

        try {
            final int major = Integer.parseInt(matcher.group(2));
            final int minor = Integer.parseInt(matcher.group(3));
            final int patch = Integer.parseInt(matcher.group(4));
            final String prerelease = nullToBlank(matcher.group(5));
            final String build = nullToBlank(matcher.group(6));

            return new SemanticVersion(major, minor, patch, prerelease, build);
        } catch (final NumberFormatException e) {
            throw new InvalidSemanticVersionException(
                    String.format("The supplied version '%s' is not a valid semantic version", version), e);
        }
    }

    /**
     * Returns a new instance of a {@link SemanticVersion} with the build information cleared.
     *
     * @return a new instance of a {@link SemanticVersion}.
     */
    public SemanticVersion withClearedBuild() {
        return new SemanticVersion(major, minor, patch, prerelease, StringUtils.EMPTY);
    }

    /**
     * Returns a new instance of a {@link SemanticVersion} with prerelease information cleared.
     *
     * @return a new instance of a {@link SemanticVersion}.
     */
    public SemanticVersion withClearedPrerelease() {
        return new SemanticVersion(major, minor, patch, StringUtils.EMPTY, build);
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public int compareTo(SemanticVersion o) {
        if (o == null) {
            return 1;
        }

        int result = Integer.compare(major, o.major);
        if (result != 0) {
            return result;
        }

        result = Integer.compare(minor, o.minor);
        if (result != 0) {
            return result;
        }

        result = Integer.compare(patch, o.patch);
        if (result != 0) {
            return result;
        }

        result = StringUtils.compare(prerelease, o.prerelease);
        if (result != 0) {
            return result;
        }

        return StringUtils.compare(build, o.build);
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof SemanticVersion that)) return false;
        return major == that.major
                && minor == that.minor
                && patch == that.patch
                && Objects.equals(prerelease, that.prerelease)
                && Objects.equals(build, that.build);
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        final StringBuilder builder = new StringBuilder();
        builder.append(String.format("%d", major()))
                .append(PERIOD)
                .append(String.format("%d", minor()))
                .append(PERIOD)
                .append(String.format("%d", patch()));

        if (prerelease() != null && !prerelease().isBlank()) {
            builder.append(DASH).append(prerelease());
        }

        if (build() != null && !build().isBlank()) {
            builder.append(PLUS).append(build());
        }

        return builder.toString();
    }
}
