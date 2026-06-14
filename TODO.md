# SFe 4.0 Features Not Yet Implemented

### 64-bit Support

This has been started but is not completed. It is likely to be limited to 8 GiB due to web browser array size limitations.

Larger bank support will need to wait until alternative sample addressing features are introduced. These are planned for version 4.4.

### Sample Containerisation

Currently, only Vorbis compression is supported. However, support for reading the headers of Opus, FLAC and WAV is currently included.

This will be implemented once audio libraries for these formats have been decided. This process is currently ongoing, so if you have an idea, please suggest it to us!

See #1 for more information.

### SFe Write Support

The reference implementation can currently read SFe banks, but has very limited write support.

Such write support will be fully included once 64-bit support and all other features are implemented. 

### Feature Flags Refactor

Right now, the feature flags are really badly written, so this subsystem will need to be rewritten.

### Untested Features

Currently, the UTF-8 decoder has not been fully tested. We need to complete:

- 4-byte unit tests
- Error-path unit tests
- Surrogate issue unit tests

