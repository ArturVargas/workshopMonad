// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title Urna
/// @notice Encuestas abiertas. Cada dirección vota una vez por encuesta y el escrutinio vive en el contrato.
contract Voting {
    struct Option {
        string label;
        uint256 votes;
    }

    struct Poll {
        address creator;
        string title;
        string description;
        uint64 deadline;
        uint256 totalVotes;
        Option[] options;
    }

    uint256 public constant MIN_OPTIONS = 2;
    uint256 public constant MAX_OPTIONS = 6;
    uint256 public constant MIN_DURATION = 1 minutes;
    uint256 public constant MAX_DURATION = 30 days;
    uint256 public constant MAX_TITLE_LENGTH = 80;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 280;
    uint256 public constant MAX_OPTION_LENGTH = 40;

    uint256 public pollCount;
    mapping(uint256 => Poll) private polls;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => uint256)) public voteOf;

    error InvalidOptionCount(uint256 count);
    error EmptyTitle();
    error TitleTooLong(uint256 length);
    error DescriptionTooLong(uint256 length);
    error EmptyOption(uint256 index);
    error OptionTooLong(uint256 index, uint256 length);
    error DuplicateOption(uint256 index);
    error InvalidDuration(uint256 duration);
    error PollNotFound(uint256 pollId);
    error VotingClosed(uint256 pollId);
    error AlreadyVoted(address voter);
    error InvalidOption(uint256 optionIndex);
    error NoVotes(uint256 pollId);

    event PollCreated(
        uint256 indexed pollId,
        address indexed creator,
        string title,
        uint64 deadline
    );
    event VoteCast(
        uint256 indexed pollId,
        address indexed voter,
        uint256 indexed optionIndex
    );

    function createPoll(
        string calldata title,
        string calldata description,
        string[] calldata optionLabels,
        uint256 duration
    ) external returns (uint256 pollId) {
        uint256 titleLength = bytes(title).length;
        if (titleLength == 0) revert EmptyTitle();
        if (titleLength > MAX_TITLE_LENGTH) revert TitleTooLong(titleLength);

        uint256 descriptionLength = bytes(description).length;
        if (descriptionLength > MAX_DESCRIPTION_LENGTH) {
            revert DescriptionTooLong(descriptionLength);
        }

        uint256 optionCount = optionLabels.length;
        if (optionCount < MIN_OPTIONS || optionCount > MAX_OPTIONS) {
            revert InvalidOptionCount(optionCount);
        }
        if (duration < MIN_DURATION || duration > MAX_DURATION) {
            revert InvalidDuration(duration);
        }

        pollId = pollCount;
        Poll storage poll = polls[pollId];
        poll.creator = msg.sender;
        poll.title = title;
        poll.description = description;
        poll.deadline = uint64(block.timestamp + duration);

        for (uint256 i = 0; i < optionCount; i++) {
            uint256 optionLength = bytes(optionLabels[i]).length;
            if (optionLength == 0) revert EmptyOption(i);
            if (optionLength > MAX_OPTION_LENGTH) {
                revert OptionTooLong(i, optionLength);
            }
            for (uint256 j = 0; j < i; j++) {
                if (
                    keccak256(bytes(optionLabels[i])) ==
                    keccak256(bytes(optionLabels[j]))
                ) {
                    revert DuplicateOption(i);
                }
            }
            poll.options.push(Option({label: optionLabels[i], votes: 0}));
        }

        pollCount = pollId + 1;
        emit PollCreated(pollId, msg.sender, title, poll.deadline);
    }

    function vote(uint256 pollId, uint256 optionIndex) external {
        Poll storage poll = _poll(pollId);
        if (block.timestamp >= poll.deadline) revert VotingClosed(pollId);
        if (hasVoted[pollId][msg.sender]) revert AlreadyVoted(msg.sender);
        if (optionIndex >= poll.options.length) revert InvalidOption(optionIndex);

        hasVoted[pollId][msg.sender] = true;
        voteOf[pollId][msg.sender] = optionIndex;
        poll.options[optionIndex].votes += 1;
        poll.totalVotes += 1;

        emit VoteCast(pollId, msg.sender, optionIndex);
    }

    function getPoll(
        uint256 pollId
    )
        external
        view
        returns (
            address creator,
            string memory title,
            string memory description,
            uint64 deadline,
            uint256 totalVotes,
            uint256 optionCount,
            bool open
        )
    {
        Poll storage poll = _poll(pollId);
        creator = poll.creator;
        title = poll.title;
        description = poll.description;
        deadline = poll.deadline;
        totalVotes = poll.totalVotes;
        optionCount = poll.options.length;
        open = block.timestamp < poll.deadline;
    }

    function getOptions(
        uint256 pollId
    ) external view returns (string[] memory labels, uint256[] memory counts) {
        Poll storage poll = _poll(pollId);
        uint256 length = poll.options.length;
        labels = new string[](length);
        counts = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            labels[i] = poll.options[i].label;
            counts[i] = poll.options[i].votes;
        }
    }

    /// @dev Si hay empate, `optionIndex` es la primera opción que alcanza el máximo.
    function winner(
        uint256 pollId
    ) external view returns (uint256 optionIndex, uint256 voteCount, bool tied) {
        Poll storage poll = _poll(pollId);
        if (poll.totalVotes == 0) revert NoVotes(pollId);

        optionIndex = 0;
        voteCount = poll.options[0].votes;
        for (uint256 i = 1; i < poll.options.length; i++) {
            uint256 count = poll.options[i].votes;
            if (count > voteCount) {
                optionIndex = i;
                voteCount = count;
                tied = false;
            } else if (count == voteCount) {
                tied = true;
            }
        }
    }

    function _poll(uint256 pollId) private view returns (Poll storage poll) {
        if (pollId >= pollCount) revert PollNotFound(pollId);
        poll = polls[pollId];
    }
}
