export const getAccountIdFromArn = (arn: string) => {
	const parts = arn.split(":");

	// The account ID is the fifth element in the array (index 4)
	const accountId = parts[4];

	return accountId;
};
