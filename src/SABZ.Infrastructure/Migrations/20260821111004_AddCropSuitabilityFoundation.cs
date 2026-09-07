using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace SABZ.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCropSuitabilityFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "TehsilId",
                table: "RegionalCropSuitabilities",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CropRequirements",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CropCatalogId = table.Column<int>(type: "int", nullable: false),
                    Season = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    GrowingDurationDays = table.Column<int>(type: "int", nullable: true),
                    MinTempC = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: true),
                    MaxTempC = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: true),
                    WaterRequirement = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    SuitableSoils = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Source = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CropRequirements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CropRequirements_CropCatalog_CropCatalogId",
                        column: x => x.CropCatalogId,
                        principalTable: "CropCatalog",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "CropCatalog",
                columns: new[] { "Id", "Category", "Description", "Name", "ScientificName" },
                values: new object[,]
                {
                    { 21, "Pulse", "Short-duration Kharif pulse, popular as catch crop and soil improver.", "Mung bean", "Vigna radiata" },
                    { 22, "Pulse", "Heat-tolerant Kharif pulse grown in Punjab and Sindh.", "Mash bean", "Vigna mungo" }
                });

            migrationBuilder.InsertData(
                table: "CropRequirements",
                columns: new[] { "Id", "CropCatalogId", "GrowingDurationDays", "MaxTempC", "MinTempC", "Season", "Source", "SuitableSoils", "WaterRequirement" },
                values: new object[,]
                {
                    { 1, 1, 150, 25m, 3m, "Rabi", "Initial SABZ suitability dataset (general agronomic knowledge, expert review recommended)", "Loam,Loamy,Clay Loam,Sandy Loam,Alluvial", "Medium" },
                    { 2, 2, 130, 37m, 20m, "Kharif", "Initial SABZ suitability dataset (general agronomic knowledge, expert review recommended)", "Clay,Clay Loam,Alluvial,Loam,Loamy", "High" },
                    { 3, 5, 110, 35m, 15m, "Kharif", "Initial SABZ suitability dataset (general agronomic knowledge, expert review recommended)", "Loam,Loamy,Sandy Loam,Well-Drained", "Medium" },
                    { 4, 3, 160, 40m, 20m, "Kharif", "Initial SABZ suitability dataset (general agronomic knowledge, expert review recommended)", "Loam,Loamy,Sandy Loam,Alluvial", "High" },
                    { 5, 4, 330, 38m, 20m, "Kharif", "Initial SABZ suitability dataset (general agronomic knowledge, expert review recommended)", "Loam,Loamy,Clay Loam,Alluvial", "High" },
                    { 6, 12, 110, 28m, 5m, "Rabi", "Initial SABZ suitability dataset (general agronomic knowledge, expert review recommended)", "Loam,Loamy,Sandy Loam,Clay Loam", "Low" },
                    { 7, 13, 120, 27m, 4m, "Rabi", "Initial SABZ suitability dataset (general agronomic knowledge, expert review recommended)", "Loam,Loamy,Sandy Loam,Clay Loam", "Low" }
                });

            // RegionalCropSuitabilities seed data moved to runtime LocationDataSeeder
            // because the new district IDs (from pakistan-admin-data.json) are not
            // available at migration time – they are inserted by the runtime seeder.

            migrationBuilder.InsertData(
                table: "CropRequirements",
                columns: new[] { "Id", "CropCatalogId", "GrowingDurationDays", "MaxTempC", "MinTempC", "Season", "Source", "SuitableSoils", "WaterRequirement" },
                values: new object[,]
                {
                    { 8, 21, 70, 38m, 20m, "Kharif", "Initial SABZ suitability dataset (general agronomic knowledge, expert review recommended)", "Loam,Loamy,Sandy Loam", "Low" },
                    { 9, 22, 80, 40m, 20m, "Kharif", "Initial SABZ suitability dataset (general agronomic knowledge, expert review recommended)", "Sandy Loam,Loam,Loamy", "Low" }
                });

            // RegionalCropSuitabilities seed data moved to runtime LocationDataSeeder (see second batch).

            migrationBuilder.CreateIndex(
                name: "IX_RegionalCropSuitabilities_TehsilId",
                table: "RegionalCropSuitabilities",
                column: "TehsilId");

            migrationBuilder.CreateIndex(
                name: "IX_CropRequirements_CropCatalogId",
                table: "CropRequirements",
                column: "CropCatalogId");

            migrationBuilder.AddForeignKey(
                name: "FK_RegionalCropSuitabilities_Tehsils_TehsilId",
                table: "RegionalCropSuitabilities",
                column: "TehsilId",
                principalTable: "Tehsils",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_RegionalCropSuitabilities_Tehsils_TehsilId",
                table: "RegionalCropSuitabilities");

            migrationBuilder.DropTable(
                name: "CropRequirements");

            migrationBuilder.DropIndex(
                name: "IX_RegionalCropSuitabilities_TehsilId",
                table: "RegionalCropSuitabilities");

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 1);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 2);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 3);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 4);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 5);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 6);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 7);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 8);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 9);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 10);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 11);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 12);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 13);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 14);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 15);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 16);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 17);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 18);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 19);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 20);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 21);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 22);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 23);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 24);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 25);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 26);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 27);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 28);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 29);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 30);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 31);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 32);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 33);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 34);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 35);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 36);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 37);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 38);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 39);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 40);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 41);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 42);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 43);

            migrationBuilder.DeleteData(
                table: "RegionalCropSuitabilities",
                keyColumn: "Id",
                keyValue: 44);

            migrationBuilder.DeleteData(
                table: "CropCatalog",
                keyColumn: "Id",
                keyValue: 21);

            migrationBuilder.DeleteData(
                table: "CropCatalog",
                keyColumn: "Id",
                keyValue: 22);

            migrationBuilder.DropColumn(
                name: "TehsilId",
                table: "RegionalCropSuitabilities");
        }
    }
}
