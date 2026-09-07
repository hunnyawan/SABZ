using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SABZ.Infrastructure.Migrations;

/// <inheritdoc />
public partial class MakeListingIdNullable : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Drop the existing unique index on (ListingId, BuyerUserId, SellerUserId)
        migrationBuilder.DropIndex(
            name: "IX_MarketplaceConversations_ListingId_BuyerUserId_SellerUserId",
            table: "MarketplaceConversations");

        // Drop the existing index on ListingId
        migrationBuilder.DropIndex(
            name: "IX_MarketplaceConversations_ListingId",
            table: "MarketplaceConversations");

        // Make ListingId nullable
        migrationBuilder.AlterColumn<Guid>(
            name: "ListingId",
            table: "MarketplaceConversations",
            type: "uniqueidentifier",
            nullable: true,
            oldClrType: typeof(Guid),
            oldType: "uniqueidentifier");

        // Recreate the ListingId index (now nullable)
        migrationBuilder.CreateIndex(
            name: "IX_MarketplaceConversations_ListingId",
            table: "MarketplaceConversations",
            column: "ListingId");

        // Recreate the unique index with a filter for non-null ListingId
        migrationBuilder.CreateIndex(
            name: "IX_MarketplaceConversations_ListingId_BuyerUserId_SellerUserId",
            table: "MarketplaceConversations",
            columns: new[] { "ListingId", "BuyerUserId", "SellerUserId" },
            unique: true,
            filter: "[ListingId] IS NOT NULL");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Drop the filtered unique index
        migrationBuilder.DropIndex(
            name: "IX_MarketplaceConversations_ListingId_BuyerUserId_SellerUserId",
            table: "MarketplaceConversations");

        // Drop the nullable ListingId index
        migrationBuilder.DropIndex(
            name: "IX_MarketplaceConversations_ListingId",
            table: "MarketplaceConversations");

        // Make ListingId non-nullable again
        migrationBuilder.AlterColumn<Guid>(
            name: "ListingId",
            table: "MarketplaceConversations",
            type: "uniqueidentifier",
            nullable: false,
            defaultValue: Guid.Empty,
            oldClrType: typeof(Guid),
            oldType: "uniqueidentifier",
            oldNullable: true);

        // Recreate the original indexes
        migrationBuilder.CreateIndex(
            name: "IX_MarketplaceConversations_ListingId",
            table: "MarketplaceConversations",
            column: "ListingId");

        migrationBuilder.CreateIndex(
            name: "IX_MarketplaceConversations_ListingId_BuyerUserId_SellerUserId",
            table: "MarketplaceConversations",
            columns: new[] { "ListingId", "BuyerUserId", "SellerUserId" },
            unique: true);
    }
}
